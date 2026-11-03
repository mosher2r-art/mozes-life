/**
 * Chapters — reusable building blocks of courses.
 *
 * A chapter is authored on its own and kept in the chapter bank. Courses are composed by
 * picking chapters in order; at publish time each chapter becomes one Unit of the
 * immutable course snapshot (see composeCourse).
 *
 * Exchange format (import / export): "mozes-chapter" v1 — one chapter per file.
 */
import { z } from "zod";
import { Course, type CourseInput, SCHEMA_ID, SCHEMA_VERSION, UnitKind } from "./schema";
import { InteractiveChapter } from "./interactive";
import { Screen as ScreenV1 } from "./schema-v1";
import { ChapterFileV2 } from "./schema-v2";

export const CHAPTER_SCHEMA_ID = "mozes-chapter";

export const ChapterFileV1 = z
  .object({
    schema: z.literal(CHAPTER_SCHEMA_ID),
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1, "לפרק חסר שם").max(120),
    kind: UnitKind.default("lesson"),
    /** Free text for authors; not shown to learners. */
    description: z.string().trim().max(2000).optional(),
    screens: z.array(ScreenV1).min(1, "בפרק אין מסכים").max(200),
  })
  .strict();
export const ChapterFile = z.discriminatedUnion("schemaVersion", [ChapterFileV1, ChapterFileV2]);
export type ChapterFile = z.infer<typeof ChapterFile>;
export type ChapterFileInput = z.input<typeof ChapterFile>;

/** Keys whose values are ids that may be referenced elsewhere in the same chapter. */
const ID_KEYS = new Set(["id", "screenId", "componentId", "choice", "accept"]);

/**
 * Returns a deep copy where every internal id (units, screens, components, options, hotspots,
 * flow rules) is replaced by a fresh one, and every reference to it is rewritten consistently.
 * Media references (assetId) are left untouched. Used when importing or duplicating chapters so
 * two chapters in the same course can never collide.
 */
export function remapIds<T>(value: T, fresh: (old: string) => string): T {
  const map = new Map<string, string>();
  const idOf = (old: string) => {
    let n = map.get(old);
    if (!n) {
      n = fresh(old);
      map.set(old, n);
    }
    return n;
  };
  // First pass: assign new ids to every declared "id", so forward references resolve the same way.
  const declare = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(declare);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "id" && typeof x === "string") idOf(x);
        else declare(x);
      }
    }
  };
  const rewrite = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        // References to ids that were never declared are left as-is so the validator reports them.
        out[k] = ID_KEYS.has(k) && typeof x === "string" ? (k === "id" || map.has(x) ? idOf(x) : x) : rewrite(x);
      }
      return out;
    }
    return v;
  };
  declare(value);
  return rewrite(value) as T;
}

/** A chapter stored in the bank is a single-unit course document, so every course tool works on it. */
export function chapterDocument(id: string, unitId: string, file: ChapterFileInput): CourseInput {
  return Course.parse({
    schema: SCHEMA_ID, schemaVersion: file.schemaVersion, id, title: file.title, locale: "he",
    settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: null }, ...(file.schemaVersion === 2 && file.variables ? { variables: file.variables } : {}) },
    units: [{ id: unitId, title: file.title, kind: file.kind ?? "lesson", screens: file.screens }],
  });
}

/** Exports a bank chapter (single-unit document) to the exchange format. */
export function toChapterFile(doc: Course): ChapterFile {
  const unit = doc.units[0];
  return {
    schema: CHAPTER_SCHEMA_ID,
    schemaVersion: doc.schemaVersion,
    title: doc.title,
    kind: unit?.kind ?? "lesson",
    screens: unit?.screens ?? [],
    ...(doc.schemaVersion === 2 && doc.settings.variables ? { variables: doc.settings.variables } : {}),
  } as ChapterFile;
}

/**
 * Reads an uploaded file: either one mozes-chapter, or a whole mozes-course whose units each
 * become a chapter. Returns chapters ready for the bank (ids not yet remapped).
 */
export function readChapterFile(input: unknown): { ok: true; chapters: ChapterFile[] } | { ok: false; message: string } {
  if (!input || typeof input !== "object") return { ok: false, message: "הקובץ אינו JSON תקין של MOZES." };
  const kind = (input as { schema?: unknown }).schema;
  if ((input as { format?: unknown }).format === "mozes-interactive-chapter") {
    const r = InteractiveChapter.safeParse(input);
    if (!r.success) return { ok: false, message: describe(r.error,input) };
    return { ok: true, chapters: [{
      schema: CHAPTER_SCHEMA_ID, schemaVersion: 1, title: r.data.chapter.name, kind: "lesson", description: r.data.chapter.description,
      screens: r.data.chapter.pages.map((scene, index) => ({
        id: `scene-screen-${index + 1}`, title: scene.title, template: "text", required: true,
        slots: { body: [{ id: `scene-component-${index + 1}`, type: "interactiveScene", scene }] },
        flow: { default: { kind: "next" }, rules: [] }, medical: { relevant: true },
        ...(index === 0 && r.data.chapter.description ? { notes: r.data.chapter.description } : {}),
      })),
    }] };
  }
  if (kind === CHAPTER_SCHEMA_ID) {
    const r = ChapterFile.safeParse(input);
    if (!r.success) return { ok: false, message: describe(r.error,input) };
    return { ok: true, chapters: [r.data] };
  }
  if (kind === SCHEMA_ID) {
    const r = Course.safeParse(input);
    if (!r.success) return { ok: false, message: describe(r.error,input) };
    const chapters = r.data.units
      .filter((u) => u.screens.length > 0)
      .map((u): ChapterFile => ({ schema: CHAPTER_SCHEMA_ID, schemaVersion: r.data.schemaVersion, title: u.title, kind: u.kind, screens: u.screens, ...(r.data.schemaVersion === 2 && r.data.settings.variables ? { variables: r.data.settings.variables } : {}) } as ChapterFile));
    if (!chapters.length) return { ok: false, message: "בקורס שבקובץ אין מסכים." };
    return { ok: true, chapters };
  }
  return { ok: false, message: 'הקובץ אינו פרק של MOZES בפורמט מזוהה. נתמכים mozes-chapter, mozes-course ו־mozes-interactive-chapter.' };
}

function describe(e: z.ZodError,input?:unknown): string {
  const i = e.issues[0];
  if (!i) return "מבנה הקובץ אינו תקין.";
  let title:string|undefined;
  if(input && typeof input==="object" && "schemaVersion" in input && input.schemaVersion===2){
    let value:unknown=input;for(const key of i.path){if(!value || typeof value!=="object")break;value=(value as Record<string,unknown>)[String(key)];if(key==="screens" && Array.isArray(value)){const index=i.path[i.path.indexOf(key)+1];const screen=typeof index==="number" ? value[index] as {title?:unknown}|undefined : undefined;if(typeof screen?.title==="string")title=screen.title;}}
  }
  return `${title ? `במסך ״${title}״: ` : ""}מבנה הקובץ אינו תקין: ${i.message}${i.path.length ? ` (במיקום ${i.path.join(".")})` : ""}`;
}

export interface ComposeInput {
  id: string;
  title: string;
  /** null = no score requirement (completion only). */
  passingScore: number | null;
  chapters: { title: string; kind: "lesson" | "exam"; doc: Course }[];
}

/** Builds the learner-facing course document from chapters, in order. */
export function composeCourse(input: ComposeInput): CourseInput {
  const variables: Record<string, string | number | boolean> = {};
  const units = input.chapters.map((chapter, chapterIndex) => {
    const doc = structuredClone(chapter.doc), unit = doc.units[0];
    if (doc.schemaVersion === 2) {
      const names = new Map<string, string>();
      Object.entries(doc.settings.variables ?? {}).forEach(([key, value], index) => { const name = `v-${chapterIndex + 1}-${index + 1}`; names.set(key, name); variables[name] = value; });
      for (const screen of unit?.screens ?? []) {
        for (const rule of screen.flow.rules) if ("variable" in rule.when) rule.when.variable = names.get(rule.when.variable) ?? rule.when.variable;
        for (const component of Object.values(screen.slots).flat()) if (component.type === "choiceQuestion") for (const option of component.options) if (option.setVariables) option.setVariables = Object.fromEntries(Object.entries(option.setVariables).map(([key, value]) => [names.get(key) ?? key, value]));
      }
    }
    return { id: unit?.id ?? `u-${doc.id}`, title: chapter.title, kind: chapter.kind, screens: unit?.screens ?? [] };
  });
  return Course.parse({
    schema: SCHEMA_ID,
    schemaVersion: input.chapters.some(ch => ch.doc.schemaVersion === 2) ? 2 : SCHEMA_VERSION,
    id: input.id,
    title: input.title,
    locale: "he",
    settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: input.passingScore }, ...(Object.keys(variables).length ? { variables } : {}) },
    units,
  });
}

