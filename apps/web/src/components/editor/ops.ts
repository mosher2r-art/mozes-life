/**
 * Pure editing operations on a course document. Every function returns a NEW course
 * (the input is never mutated), which is what makes undo/redo a simple history stack.
 */
import {
  type Block,
  type Component,
  type ComponentType,
  type Course,
  type FlowTarget,
  type Screen,
  TEMPLATES,
  type TemplateId,
} from "@mozes/content-schema";

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const clone = <T>(v: T): T => structuredClone(v);

/** Templates that need no media. */
export const AUTHORABLE_TEMPLATES: TemplateId[] = ["text", "question", "sequence", "summary"];
/** Templates created from a chosen media file, and which file kinds each accepts. */
export const MEDIA_TEMPLATES: Partial<Record<TemplateId, ("image" | "video")[]>> = {
  video: ["video"],
  media_text: ["image", "video"],
  scenario: ["video", "image"],
  cinematic_intro: ["image", "video"],
};
/** Component types that need an uploaded file. */
export const MEDIA_TYPES: ComponentType[] = ["image", "video", "audio", "hotspotImage"];
/** Not yet authorable in the editor (needs the hotspot drawing tool). */
export const UNSUPPORTED_TYPES: ComponentType[] = ["hotspotImage"];

export interface PickedMedia {
  id: string;
  kind: "image" | "video" | "audio" | "captions";
  altText: string;
}

export function mediaComponent(m: PickedMedia, opts: { cover?: boolean } = {}): Component {
  const id = newId("c");
  if (m.kind === "image") return { id, type: "image", media: { assetId: m.id }, alt: m.altText, decorative: !!opts.cover };
  if (m.kind === "video") return { id, type: "video", media: { assetId: m.id }, requiredWatchPercent: 0 };
  if (m.kind === "audio") return { id, type: "audio", media: { assetId: m.id }, transcript: "תמליל ההקלטה" };
  throw new Error("captions are attached to a video, not placed on a screen");
}

export const COMPONENT_LABEL: Record<ComponentType, string> = {
  heading: "כותרת",
  richText: "טקסט",
  callout: "הדגשה",
  image: "תמונה",
  video: "וידאו",
  audio: "שמע",
  button: "כפתור",
  choiceQuestion: "שאלת בחירה",
  trueFalse: "נכון / לא נכון",
  hotspotImage: "נקודות על תמונה",
  sequenceTask: "סידור פעולות",
};

/* ───────────── Rich text <-> plain text ───────────── */

/** Paragraphs are separated by a blank line; lines starting with "- " form a bulleted list. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.kind === "paragraph"
        ? b.content.map((i) => i.text).join("")
        : b.items.map((it) => `- ${it.map((i) => i.text).join("")}`).join("\n"),
    )
    .join("\n\n");
}

export function textToBlocks(text: string): Block[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      const lines = chunk.split("\n");
      if (lines.every((l) => /^\s*-\s+/.test(l))) {
        return { kind: "list", ordered: false, items: lines.map((l) => [{ text: l.replace(/^\s*-\s+/, "") }]) };
      }
      return { kind: "paragraph", content: [{ text: lines.join("\n") }] };
    });
}

/* ───────────── Defaults ───────────── */

export function defaultComponent(type: ComponentType): Component {
  const id = newId("c");
  const fb = { correct: "", incorrect: "" };
  switch (type) {
    case "heading":
      return { id, type, text: "כותרת חדשה", level: 2 };
    case "richText":
      return { id, type, body: textToBlocks("טקסט חדש") };
    case "callout":
      return { id, type, tone: "info", body: textToBlocks("טקסט ההדגשה") };
    case "button":
      return { id, type, label: "המשך", target: { kind: "next" } };
    case "choiceQuestion":
      return {
        id,
        type,
        prompt: "השאלה כאן",
        mode: "single",
        shuffle: false,
        points: 1,
        maxAttempts: 2,
        showCorrectAfterFinalAttempt: true,
        feedback: fb,
        options: [
          { id: newId("o"), text: "תשובה נכונה", correct: true },
          { id: newId("o"), text: "תשובה שגויה", correct: false },
        ],
      };
    case "trueFalse":
      return { id, type, prompt: "הטענה כאן", answer: true, points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true, feedback: fb };
    case "sequenceTask":
      return {
        id,
        type,
        prompt: "סדרו את השלבים לפי הסדר הנכון",
        points: 1,
        maxAttempts: 2,
        showCorrectAfterFinalAttempt: true,
        feedback: fb,
        items: [
          { id: newId("i"), text: "שלב ראשון" },
          { id: newId("i"), text: "שלב שני" },
          { id: newId("i"), text: "שלב שלישי" },
        ],
      };
    default:
      throw new Error(`${type} requires the media library`);
  }
}

export function defaultScreen(template: TemplateId, media?: PickedMedia): Screen {
  const base = { id: newId("s"), template, required: true, flow: { default: { kind: "next" } as FlowTarget, rules: [] }, medical: { relevant: false } };
  const heading = (text: string, level: 1 | 2 | 3 = 1): Component => ({ id: newId("c"), type: "heading", text, level });
  const need = () => {
    if (!media) throw new Error(`${template} needs a media file`);
    return media;
  };
  switch (template) {
    case "text":
      return { ...base, title: "מסך הסבר", slots: { body: [{ ...defaultComponent("heading"), level: 1 } as Component, defaultComponent("richText")] } };
    case "question":
      return { ...base, title: "שאלה", slots: { question: [defaultComponent("choiceQuestion")] } };
    case "sequence":
      return { ...base, title: "סידור פעולות", slots: { task: [defaultComponent("sequenceTask")] } };
    case "summary":
      return {
        ...base,
        title: "סיכום",
        flow: { default: { kind: "end" }, rules: [] },
        slots: { body: [heading("סיימתם את הקורס"), { id: newId("c"), type: "richText", body: textToBlocks("כל הכבוד!") }] },
      };
    case "video":
      return { ...base, title: "סרטון", slots: { video: [mediaComponent(need())], body: [heading("כותרת הסרטון", 2)] } };
    case "media_text":
      return { ...base, title: "מדיה וטקסט", slots: { media: [mediaComponent(need())], body: [heading("כותרת", 2), defaultComponent("richText")] } };
    case "cinematic_intro":
      return { ...base, title: "פתיחה", slots: { background: [mediaComponent(need(), { cover: true })], title: [heading("שם הקורס")], body: [defaultComponent("richText")] } };
    case "scenario": {
      const m = need();
      const media = mediaComponent(m);
      if (media.type === "video") media.pauseAtMs = 5000;
      const q = defaultComponent("choiceQuestion");
      if (q.type === "choiceQuestion") q.prompt = "מה עושים עכשיו?";
      return { ...base, title: "תרחיש", slots: { media: [media], intro: [], decision: [q] } };
    }
    default:
      throw new Error(`${template} is not authorable yet`);
  }
}

/* ───────────── Lookups ───────────── */

export function findScreen(course: Course, screenId: string): { unitIndex: number; screenIndex: number; screen: Screen } | null {
  for (let u = 0; u < course.units.length; u++) {
    const s = course.units[u]!.screens.findIndex((x) => x.id === screenId);
    if (s >= 0) return { unitIndex: u, screenIndex: s, screen: course.units[u]!.screens[s]! };
  }
  return null;
}

function mapScreen(course: Course, screenId: string, fn: (s: Screen) => void): Course {
  const c = clone(course);
  const hit = findScreen(c, screenId);
  if (hit) fn(hit.screen);
  return c;
}

function move<T>(arr: T[], index: number, delta: number): void {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= arr.length) return;
  [arr[index], arr[to]] = [arr[to]!, arr[index]!];
}

/* ───────────── Units ───────────── */

export function addUnit(course: Course): { course: Course; unitId: string } {
  const c = clone(course);
  const unitId = newId("u");
  c.units.push({ id: unitId, title: `יחידה ${c.units.length + 1}`, screens: [] });
  return { course: c, unitId };
}

export const renameUnit = (course: Course, unitId: string, title: string): Course => {
  const c = clone(course);
  const u = c.units.find((x) => x.id === unitId);
  if (u) u.title = title;
  return c;
};

export function deleteUnit(course: Course, unitId: string): Course {
  const c = clone(course);
  const unit = c.units.find((u) => u.id === unitId);
  c.units = c.units.filter((u) => u.id !== unitId);
  return unit ? unlinkScreens(c, new Set(unit.screens.map((s) => s.id))) : c;
}

export const moveUnit = (course: Course, unitId: string, delta: number): Course => {
  const c = clone(course);
  move(c.units, c.units.findIndex((u) => u.id === unitId), delta);
  return c;
};

/* ───────────── Screens ───────────── */

export function addScreen(course: Course, unitId: string, template: TemplateId, media?: PickedMedia): { course: Course; screenId: string } {
  const c = clone(course);
  const unit = c.units.find((u) => u.id === unitId);
  const screen = defaultScreen(template, media);
  unit?.screens.push(screen);
  return { course: c, screenId: screen.id };
}

/** Replaces links to removed screens with "continue to next" so nothing points nowhere. */
function unlinkScreens(c: Course, removed: Set<string>): Course {
  const fix = (t: FlowTarget): FlowTarget => (t.kind === "goto" && removed.has(t.screenId) ? { kind: "next" } : t);
  for (const u of c.units)
    for (const s of u.screens) {
      s.flow.default = fix(s.flow.default);
      s.flow.rules = s.flow.rules.filter((r) => !(r.then.kind === "goto" && removed.has(r.then.screenId)));
      for (const comps of Object.values(s.slots)) for (const comp of comps) if (comp.type === "button") comp.target = fix(comp.target);
    }
  return c;
}

export function deleteScreen(course: Course, screenId: string): Course {
  const c = clone(course);
  for (const u of c.units) u.screens = u.screens.filter((s) => s.id !== screenId);
  return unlinkScreens(c, new Set([screenId]));
}

export function moveScreen(course: Course, screenId: string, delta: number): Course {
  const c = clone(course);
  const hit = findScreen(c, screenId);
  if (hit) move(c.units[hit.unitIndex]!.screens, hit.screenIndex, delta);
  return c;
}

export function duplicateScreen(course: Course, screenId: string): { course: Course; screenId: string } {
  const c = clone(course);
  const hit = findScreen(c, screenId);
  if (!hit) return { course: c, screenId };
  const copy = clone(hit.screen);
  copy.id = newId("s");
  copy.title = `${copy.title} (עותק)`;
  const idMap = new Map<string, string>();
  for (const comps of Object.values(copy.slots))
    for (const comp of comps) {
      const nid = newId("c");
      idMap.set(comp.id, nid);
      comp.id = nid;
      if (comp.type === "choiceQuestion") {
        for (const o of comp.options) {
          const oid = newId("o");
          idMap.set(o.id, oid);
          o.id = oid;
        }
      }
      if (comp.type === "sequenceTask") for (const it of comp.items) it.id = newId("i");
      if (comp.type === "hotspotImage") for (const h of comp.hotspots) h.id = newId("h");
    }
  copy.flow.rules = copy.flow.rules.map((r) => ({
    ...r,
    id: newId("r"),
    when: {
      componentId: idMap.get(r.when.componentId) ?? r.when.componentId,
      outcome: typeof r.when.outcome === "object" ? { choice: idMap.get(r.when.outcome.choice) ?? r.when.outcome.choice } : r.when.outcome,
    },
  }));
  c.units[hit.unitIndex]!.screens.splice(hit.screenIndex + 1, 0, copy);
  return { course: c, screenId: copy.id };
}

export const updateScreen = (course: Course, screenId: string, fn: (s: Screen) => void): Course => mapScreen(course, screenId, fn);

/* ───────────── Components ───────────── */

export function allowedToAdd(template: TemplateId, slotId: string): ComponentType[] {
  const slot = TEMPLATES[template].slots.find((s) => s.id === slotId);
  return (slot?.accepts ?? []).filter((t) => !UNSUPPORTED_TYPES.includes(t));
}

export function addComponent(course: Course, screenId: string, slotId: string, type: ComponentType, media?: PickedMedia): { course: Course; componentId: string } {
  const comp = MEDIA_TYPES.includes(type) ? mediaComponent(media ?? (() => { throw new Error("media required"); })()) : defaultComponent(type);
  const c = mapScreen(course, screenId, (s) => {
    s.slots[slotId] = [...(s.slots[slotId] ?? []), comp];
  });
  return { course: c, componentId: comp.id };
}

export const removeComponent = (course: Course, screenId: string, componentId: string): Course =>
  mapScreen(course, screenId, (s) => {
    for (const k of Object.keys(s.slots)) s.slots[k] = s.slots[k]!.filter((x) => x.id !== componentId);
    s.flow.rules = s.flow.rules.filter((r) => r.when.componentId !== componentId);
  });

export const moveComponent = (course: Course, screenId: string, componentId: string, delta: number): Course =>
  mapScreen(course, screenId, (s) => {
    for (const k of Object.keys(s.slots)) {
      const i = s.slots[k]!.findIndex((x) => x.id === componentId);
      if (i >= 0) move(s.slots[k]!, i, delta);
    }
  });

export const updateComponent = (course: Course, screenId: string, componentId: string, fn: (comp: Component) => void): Course =>
  mapScreen(course, screenId, (s) => {
    for (const comps of Object.values(s.slots)) for (const comp of comps) if (comp.id === componentId) fn(comp);
  });

/** Sets (or clears, with target null) the branch taken after choosing an option. */
export const setChoiceBranch = (course: Course, screenId: string, componentId: string, optionId: string, target: FlowTarget | null): Course =>
  mapScreen(course, screenId, (s) => {
    s.flow.rules = s.flow.rules.filter(
      (r) => !(r.when.componentId === componentId && typeof r.when.outcome === "object" && r.when.outcome.choice === optionId),
    );
    if (target) s.flow.rules.push({ id: newId("r"), when: { componentId, outcome: { choice: optionId } }, then: target });
  });
