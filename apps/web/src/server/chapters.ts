import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  type ChapterFile,
  Course,
  type CourseInput,
  chapterDocument,
  readChapterFile,
  remapIds,
  toChapterFile,
} from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import { db } from "@/db";
import { asset, auditLog, chapter, course } from "@/db/schema";
import { collectAssetIds } from "@/lib/collect-assets";

export const rid = (prefix: string) => `${prefix}-${randomBytes(5).toString("hex")}`;
const fresh = (old: string) => {
  const prefix = /^([a-z]{1,3})-/.exec(old)?.[1] ?? "x";
  return rid(prefix);
};

export type ChapterKind = "lesson" | "exam";

export interface ChapterRow {
  id: string;
  title: string;
  kind: ChapterKind;
  screens: number;
  questions: number;
  errors: number;
  usedIn: { id: string; title: string }[];
  updatedAt: Date;
}

function stats(content: unknown) {
  const v = validateCourse(content);
  const unit = v.course?.units[0];
  const screens = unit?.screens.length ?? 0;
  const questions = unit ? unit.screens.flatMap((s) => Object.values(s.slots).flat()).filter((c) => ["choiceQuestion", "trueFalse", "hotspotImage", "sequenceTask"].includes(c.type)).length : 0;
  return { screens, questions, errors: v.issues.filter((i) => i.severity === "error").length };
}

/** Which courses use each chapter (chapter_ids is a small JSON array per course). */
async function usage(): Promise<Map<string, { id: string; title: string }[]>> {
  const rows = await db.select({ id: course.id, title: course.title, ids: course.chapterIds }).from(course).where(sql`${course.chapterIds} is not null`);
  const out = new Map<string, { id: string; title: string }[]>();
  for (const r of rows) for (const ch of r.ids ?? []) out.set(ch, [...(out.get(ch) ?? []), { id: r.id, title: r.title }]);
  return out;
}

export async function listChapters(): Promise<ChapterRow[]> {
  const [rows, used] = await Promise.all([db.select().from(chapter).orderBy(desc(chapter.updatedAt)), usage()]);
  return rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, updatedAt: r.updatedAt, usedIn: used.get(r.id) ?? [], ...stats(r.content) }));
}

function starter(title: string, kind: ChapterKind): ChapterFile {
  const h = { id: rid("c"), type: "heading" as const, text: title, level: 1 as const };
  if (kind === "exam") {
    return {
      schema: "mozes-chapter",
      schemaVersion: 1,
      title,
      kind,
      screens: [
        {
          id: rid("s"),
          title: "פתיחת המבחן",
          template: "text",
          slots: { body: [h, { id: rid("c"), type: "richText", body: [{ kind: "paragraph", content: [{ text: "כתבו כאן הנחיות למבחן." }] }] }] },
          required: true,
          flow: { default: { kind: "next" }, rules: [] },
          medical: { relevant: false },
        },
      ],
    };
  }
  return {
    schema: "mozes-chapter",
    schemaVersion: 1,
    title,
    kind,
    screens: [
      {
        id: rid("s"),
        title: "פתיחה",
        template: "text",
        slots: { body: [h, { id: rid("c"), type: "richText", body: [{ kind: "paragraph", content: [{ text: "כתבו כאן את פתיח הפרק." }] }] }] },
        required: true,
        flow: { default: { kind: "next" }, rules: [] },
        medical: { relevant: false },
      },
    ],
  };
}

async function insertChapter(actorId: string, file: ChapterFile, action: string, details: Record<string, unknown> = {}): Promise<string> {
  const id = rid("ch");
  const content = Course.parse(chapterDocument(id, rid("u"), file));
  await db.transaction(async (tx) => {
    await tx.insert(chapter).values({ id, title: file.title, kind: file.kind, content, createdBy: actorId, updatedBy: actorId });
    await tx.insert(auditLog).values({ actorId, action, entity: "chapter", entityId: id, details: { title: file.title, kind: file.kind, ...details } });
  });
  return id;
}

export function createChapter(actorId: string, title: string, kind: ChapterKind): Promise<string> {
  return insertChapter(actorId, starter(title, kind), "chapter.create");
}

export async function getChapter(id: string) {
  const [row] = await db.select().from(chapter).where(eq(chapter.id, id));
  if (!row) return null;
  return { ...row, content: Course.parse(row.content), usedIn: (await usage()).get(id) ?? [] };
}

export type ChapterSave = { ok: true; revision: number } | { ok: false; reason: "not_found" | "conflict" | "invalid"; revision?: number; message?: string };

/** Saves the chapter. Structural schema only — completeness is checked when a course is published. */
export async function saveChapter(id: string, actorId: string, input: unknown, baseRevision: number): Promise<ChapterSave> {
  const parsed = Course.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  const doc = parsed.data;
  if (doc.id !== id) return { ok: false, reason: "invalid", message: "מזהה הפרק אינו תואם" };
  if (doc.units.length !== 1) return { ok: false, reason: "invalid", message: "פרק מכיל יחידה אחת בדיוק" };
  const unit = doc.units[0]!;
  // The chapter title lives in one place for authors; keep the unit in step.
  unit.title = doc.title;

  return db.transaction(async (tx) => {
    const [row] = await tx.select({ revision: chapter.revision }).from(chapter).where(eq(chapter.id, id)).for("update");
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.revision !== baseRevision) return { ok: false, reason: "conflict", revision: row.revision } as const;
    const revision = row.revision + 1;
    await tx.update(chapter).set({ content: doc, title: doc.title, kind: unit.kind, revision, updatedBy: actorId }).where(eq(chapter.id, id));
    return { ok: true, revision } as const;
  });
}

export async function duplicateChapter(actorId: string, id: string): Promise<string | null> {
  const ch = await getChapter(id);
  if (!ch) return null;
  const file = remapIds(toChapterFile(ch.content), fresh);
  return insertChapter(actorId, { ...file, title: `${file.title} (עותק)`.slice(0, 120) }, "chapter.duplicate", { from: id });
}

export async function deleteChapter(actorId: string, id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const used = (await usage()).get(id) ?? [];
  if (used.length) return { ok: false, message: `הפרק משמש בקורסים: ${used.map((c) => c.title).join(", ")}. הסירו אותו מהם קודם.` };
  const r = await db.delete(chapter).where(eq(chapter.id, id)).returning({ id: chapter.id });
  if (!r.length) return { ok: false, message: "הפרק לא נמצא." };
  await db.insert(auditLog).values({ actorId, action: "chapter.delete", entity: "chapter", entityId: id });
  return { ok: true };
}

export interface ImportedChapter {
  file: string;
  ok: boolean;
  message?: string;
  chapters?: { id: string; title: string; kind: ChapterKind; missingMedia: number }[];
}

/**
 * Imports chapter files. Every id inside is regenerated so imported chapters never collide with
 * existing ones; media references are kept and reported when the library doesn't have them.
 */
export async function importChapters(actorId: string, files: { name: string; json: unknown }[]): Promise<ImportedChapter[]> {
  const out: ImportedChapter[] = [];
  for (const f of files) {
    const r = readChapterFile(f.json);
    if (!r.ok) {
      out.push({ file: f.name, ok: false, message: r.message });
      continue;
    }
    const created: NonNullable<ImportedChapter["chapters"]> = [];
    for (const ch of r.chapters) {
      const file = remapIds(ch, fresh);
      const assetIds = collectAssetIds(Course.parse(chapterDocument("x", "u", file)));
      const known = assetIds.length ? await db.select({ id: asset.id }).from(asset).where(inArray(asset.id, assetIds)) : [];
      const id = await insertChapter(actorId, file, "chapter.import", { file: f.name });
      created.push({ id, title: file.title, kind: file.kind, missingMedia: assetIds.length - known.length });
    }
    out.push({ file: f.name, ok: true, chapters: created });
  }
  return out;
}

export async function exportChapter(id: string): Promise<ChapterFile | null> {
  const ch = await getChapter(id);
  return ch ? toChapterFile(ch.content) : null;
}

/** Loads chapters by id, preserving the requested order. Missing ids are skipped. */
export async function chaptersByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(chapter).where(inArray(chapter.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, title: r.title, kind: r.kind, doc: Course.parse(r.content), updatedAt: r.updatedAt }] : [];
  });
}

/** Converts a pre-chapter course document into bank chapters (one per unit). */
export async function chaptersFromLegacy(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actorId: string | null, doc: CourseInput): Promise<string[]> {
  const parsed = Course.parse(doc);
  const ids: string[] = [];
  for (const unit of parsed.units) {
    if (!unit.screens.length) continue;
    const id = rid("ch");
    // Keep the original ids: learners pinned to older versions are unaffected either way, and the
    // next published version stays recognisably the same content.
    const content = Course.parse({ ...parsed, id, title: unit.title, units: [unit], settings: undefined });
    await tx.insert(chapter).values({ id, title: unit.title, kind: unit.kind, content, createdBy: actorId, updatedBy: actorId });
    ids.push(id);
  }
  return ids;
}

export const chapterExists = async (id: string) => (await db.select({ id: chapter.id }).from(chapter).where(and(eq(chapter.id, id))).limit(1)).length > 0;
