import type { Screen as StoredScreen } from "@mozes/content-schema";
/**
 * Pure editing operations on a course document. Every function returns a NEW course
 * (the input is never mutated), which is what makes undo/redo a simple history stack.
 */
import {
  type Block,
  type ComponentV2 as Component,
  type ComponentType,
  type Course,
  type FlowTarget,
  type ScreenV2 as Screen,
  type CourseV2,
  upgradeDraftToV2,
  TEMPLATES,
  type TemplateId,
} from "@mozes/content-schema";

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const clone = <T>(v: T): T => structuredClone(v);

/** Templates that need no media. */
export const AUTHORABLE_TEMPLATES: TemplateId[] = ["text", "question", "sequence", "decision", "summary"];
/** Templates created from a chosen media file, and which file kinds each accepts. */
export const MEDIA_TEMPLATES: Partial<Record<TemplateId, ("image" | "video")[]>> = {
  video: ["video"],
  hotspot: ["image"],
  media_text: ["image", "video"],
  scenario: ["video", "image"],
  cinematic_intro: ["image", "video"],
};
/** Component types that need an uploaded file. */
export const MEDIA_TYPES: ComponentType[] = [];
/** Not yet authorable in the editor (needs the hotspot drawing tool). */
export const UNSUPPORTED_TYPES: ComponentType[] = ["interactiveScene"];

export interface PickedMedia {
  id: string;
  kind: "image" | "video" | "audio" | "captions" | "animation";
  altText: string;
}

export function mediaComponent(m: PickedMedia, opts: { cover?: boolean } = {}): Component {
  const id = newId("c");
  if (m.kind === "image") return { id, type: "image", media: { assetId: m.id }, alt: m.altText, decorative: !!opts.cover, aspectRatio: "auto" };
  if (m.kind === "video") return { id, type: "video", media: { assetId: m.id }, requiredWatchPercent: 0 };
  if (m.kind === "audio") return { id, type: "audio", media: { assetId: m.id }, transcript: "תמליל ההקלטה", autoplay: false };
  throw new Error("captions are attached to a video, not placed on a screen");
}

export const COMPONENT_LABEL: Record<ComponentType, string> = {
  interactiveScene: "מסך אינטראקטיבי מיובא",
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
  animation: "אנימציה",
  reveal: "חשיפת פריטים",
  hotspotExplore: "חקירת תמונה",
  simulation: "מודול בדיקת תוכנה",
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
  const placeholder = (description: string) => ({ placeholder: { requestId: newId("request"), description } });
  switch (type) {
    case "image": return { id, type, media: placeholder("תמונה להעלאה"), alt: "תיאור התמונה", decorative: false, aspectRatio: "auto" };
    case "video": return { id, type, media: placeholder("סרטון להעלאה"), requiredWatchPercent: 0 };
    case "audio": return { id, type, media: placeholder("הקלטה להעלאה"), transcript: "תמליל ההקלטה", autoplay: false };
    case "animation": return { id, type, media: placeholder("אנימציית Lottie או וידאו שקט"), alt: "תיאור האנימציה", loop: false, playOn: "click" };
    case "reveal": return { id, type, items: [{ id: newId("i"), title: "פריט ראשון", content: { kind: "text", body: textToBlocks("תוכן הפריט") } }], mode: "any", requireAll: true };
    case "hotspotExplore": return { id, type, media: placeholder("תמונה לחקירה"), alt: "תיאור התמונה", hotspots: [{ id: newId("h"), label: "אזור ראשון", shape: { kind: "rect", x: 10, y: 10, w: 30, h: 30 }, title: "אזור ראשון", body: textToBlocks("הסבר על האזור") }], requireAll: true };
    case "hotspotImage": return { id, type, media: placeholder("תמונה לשאלה עם אזורים"), alt: "תיאור התמונה", prompt: "בחרו באזור הנכון", mode: "single", hotspots: [{ id: newId("h"), label: "אזור ראשון", shape: { kind: "rect", x: 10, y: 10, w: 30, h: 30 }, correct: true }], points: 1, maxAttempts: 2, showCorrectAfterFinalAttempt: true, feedback: fb };
    case "simulation": return { id, type, module: "software-sequence", moduleVersion: 1, config: { steps: ["פעולת תוכנה ראשונה", "פעולת תוכנה שנייה", "פעולת תוכנה שלישית"] }, completion: { required: true } };
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
  const selectedMedia=(fallback:"image"|"video",cover=false)=>media ? mediaComponent(media,{cover}) : defaultComponent(fallback);
  switch (template) {
    case "hotspot": {
      const c=defaultComponent("hotspotImage");if(c.type!=="hotspotImage")throw Error();if(media)c.media={assetId:media.id};return {...base,title:"שאלת אזורים",slots:{task:[c]}};
    }
    case "decision": {
      const q=defaultComponent("choiceQuestion");if(q.type!=="choiceQuestion")throw Error();q.maxAttempts=1;q.options.forEach(o=>{o.feedback="הסבר לבחירה זו";});return {...base,title:"החלטה בתרחיש",slots:{media:[defaultComponent("image")],intro:[defaultComponent("richText")],decision:[q]},flow:{default:{kind:"next"},rules:q.options.map(o=>({id:newId("r"),when:{componentId:q.id,outcome:{choice:o.id}},then:{kind:"next"}}))}};
    }
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
      return { ...base, title: "סרטון", slots: { video: [selectedMedia("video")], body: [heading("כותרת הסרטון", 2)] } };
    case "media_text":
      return { ...base, title: "מדיה וטקסט", slots: { media: [selectedMedia("image")], body: [heading("כותרת", 2), defaultComponent("richText")] } };
    case "cinematic_intro":
      return { ...base, title: "פתיחה", slots: { background: [selectedMedia("image",true)], title: [heading("שם הקורס")], body: [defaultComponent("richText")] } };
    case "scenario": {
      const media = selectedMedia("video");
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

export function findScreen(course: CourseV2, screenId: string): { unitIndex: number; screenIndex: number; screen: Screen } | null;
export function findScreen(course: Course, screenId: string): { unitIndex: number; screenIndex: number; screen: StoredScreen } | null;
export function findScreen(course: Course, screenId: string): { unitIndex: number; screenIndex: number; screen: StoredScreen } | null {
  for (let u = 0; u < course.units.length; u++) {
    const s = course.units[u]!.screens.findIndex((x) => x.id === screenId);
    if (s >= 0) return { unitIndex: u, screenIndex: s, screen: course.units[u]!.screens[s]! };
  }
  return null;
}

function mapScreen(course: Course, screenId: string, fn: (s: Screen) => void): CourseV2 {
  const c = upgradeDraftToV2(course);
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

export function addUnit(course: Course): { course: CourseV2; unitId: string } {
  const c = upgradeDraftToV2(course);
  const unitId = newId("u");
  c.units.push({ id: unitId, title: `יחידה ${c.units.length + 1}`, kind: "lesson", screens: [] });
  return { course: c, unitId };
}

export const renameUnit = (course: Course, unitId: string, title: string): CourseV2 => {
  const c = upgradeDraftToV2(course);
  const u = c.units.find((x) => x.id === unitId);
  if (u) u.title = title;
  return c;
};

export function deleteUnit(course: Course, unitId: string): CourseV2 {
  const c = upgradeDraftToV2(course);
  const unit = c.units.find((u) => u.id === unitId);
  c.units = c.units.filter((u) => u.id !== unitId);
  return unit ? unlinkScreens(c, new Set(unit.screens.map((s) => s.id))) : c;
}

export const moveUnit = (course: Course, unitId: string, delta: number): CourseV2 => {
  const c = upgradeDraftToV2(course);
  move(c.units, c.units.findIndex((u) => u.id === unitId), delta);
  return c;
};

/* ───────────── Screens ───────────── */

export function addScreen(course: Course, unitId: string, template: TemplateId, media?: PickedMedia): { course: CourseV2; screenId: string } {
  const c = upgradeDraftToV2(course);
  const unit = c.units.find((u) => u.id === unitId);
  const screen = defaultScreen(template, media);
  unit?.screens.push(screen);
  return { course: c, screenId: screen.id };
}

/** Replaces links to removed screens with "continue to next" so nothing points nowhere. */
function unlinkScreens(c: CourseV2, removed: Set<string>): CourseV2 {
  const fix = (t: FlowTarget): FlowTarget => (t.kind === "goto" && removed.has(t.screenId) ? { kind: "next" } : t);
  for (const u of c.units)
    for (const s of u.screens) {
      s.flow.default = fix(s.flow.default);
      s.flow.rules = s.flow.rules.filter((r) => !(r.then.kind === "goto" && removed.has(r.then.screenId)));
      for (const comps of Object.values(s.slots)) for (const comp of comps) if (comp.type === "button") comp.target = fix(comp.target);
    }
  return c;
}

export function deleteScreen(course: Course, screenId: string): CourseV2 {
  const c = upgradeDraftToV2(course);
  for (const u of c.units) u.screens = u.screens.filter((s) => s.id !== screenId);
  return unlinkScreens(c, new Set([screenId]));
}

export function moveScreen(course: Course, screenId: string, delta: number): CourseV2 {
  const c = upgradeDraftToV2(course);
  const hit = findScreen(c, screenId);
  if (hit) move(c.units[hit.unitIndex]!.screens, hit.screenIndex, delta);
  return c;
}

export function duplicateScreen(course: Course, screenId: string): { course: CourseV2; screenId: string } {
  const c = upgradeDraftToV2(course);
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
      if (comp.type === "sequenceTask" || comp.type === "reveal") for (const it of comp.items) it.id = newId("i");
      if (comp.type === "hotspotImage" || comp.type === "hotspotExplore") for (const h of comp.hotspots) h.id = newId("h");
    }
  if (copy.narration) copy.narration.cues = copy.narration.cues.map(cue => ({ ...cue, componentId: idMap.get(cue.componentId) ?? cue.componentId }));
  copy.flow.rules = copy.flow.rules.map((r) => ({
    ...r,
    id: newId("r"),
    when: "variable" in r.when ? r.when : {
      componentId: idMap.get(r.when.componentId) ?? r.when.componentId,
      outcome: typeof r.when.outcome === "object" ? { choice: idMap.get(r.when.outcome.choice) ?? r.when.outcome.choice } : r.when.outcome,
    },
  }));
  c.units[hit.unitIndex]!.screens.splice(hit.screenIndex + 1, 0, copy);
  return { course: c, screenId: copy.id };
}

export const updateScreen = (course: Course, screenId: string, fn: (s: Screen) => void): CourseV2 => mapScreen(course, screenId, fn);

/* ───────────── Components ───────────── */

export function allowedToAdd(template: TemplateId, slotId: string): ComponentType[] {
  const slot = TEMPLATES[template].slots.find((s) => s.id === slotId);
  return (slot?.accepts ?? []).filter((t) => !UNSUPPORTED_TYPES.includes(t));
}

export function addComponent(course: Course, screenId: string, slotId: string, type: ComponentType, media?: PickedMedia): { course: CourseV2; componentId: string } {
  const comp = MEDIA_TYPES.includes(type) ? mediaComponent(media ?? (() => { throw new Error("media required"); })()) : defaultComponent(type);
  const c = mapScreen(course, screenId, (s) => {
    s.slots[slotId] = [...(s.slots[slotId] ?? []), comp];
  });
  return { course: c, componentId: comp.id };
}

export const removeComponent = (course: Course, screenId: string, componentId: string): CourseV2 =>
  mapScreen(course, screenId, (s) => {
    for (const k of Object.keys(s.slots)) s.slots[k] = s.slots[k]!.filter((x) => x.id !== componentId);
    s.flow.rules = s.flow.rules.filter((r) => !("componentId" in r.when) || r.when.componentId !== componentId);
    if (s.narration) s.narration.cues = s.narration.cues.filter(cue => cue.componentId !== componentId);
  });

export const moveComponent = (course: Course, screenId: string, componentId: string, delta: number): CourseV2 =>
  mapScreen(course, screenId, (s) => {
    for (const k of Object.keys(s.slots)) {
      const i = s.slots[k]!.findIndex((x) => x.id === componentId);
      if (i >= 0) move(s.slots[k]!, i, delta);
    }
  });

export const updateComponent = (course: Course, screenId: string, componentId: string, fn: (comp: Component) => void): CourseV2 =>
  mapScreen(course, screenId, (s) => {
    for (const comps of Object.values(s.slots)) for (const comp of comps) if (comp.id === componentId) fn(comp);
  });

/** Sets (or clears, with target null) the branch taken after choosing an option. */
export const setChoiceBranch = (course: Course, screenId: string, componentId: string, optionId: string, target: FlowTarget | null): CourseV2 =>
  mapScreen(course, screenId, (s) => {
    s.flow.rules = s.flow.rules.filter(
      (r) => !("componentId" in r.when && r.when.componentId === componentId && typeof r.when.outcome === "object" && r.when.outcome.choice === optionId),
    );
    if (target) s.flow.rules.push({ id: newId("r"), when: { componentId, outcome: { choice: optionId } }, then: target });
  });

export function renameChapter(course: Course, title: string): CourseV2 { const c = upgradeDraftToV2(course); c.title = title; if(c.units[0]) c.units[0].title = title; return c; }
export function setChapterKind(course: Course, kind: "lesson" | "exam"): CourseV2 { const c = upgradeDraftToV2(course); if(c.units[0]) c.units[0].kind = kind; return c; }

export function reorderScreen(course:Course,sourceId:string,targetId:string):CourseV2 {
  const c=upgradeDraftToV2(course),source=findScreen(c,sourceId),target=findScreen(c,targetId);
  if(!source || !target || source.unitIndex!==target.unitIndex || sourceId===targetId)return c;
  const screens=c.units[source.unitIndex]!.screens,[moving]=screens.splice(source.screenIndex,1);screens.splice(target.screenIndex,0,moving!);return c;
}
/** A template change is refused if any existing block would have to be discarded. */
export function changeTemplate(course:Course,screenId:string,template:TemplateId):{ok:true;course:CourseV2}|{ok:false;message:string} {
  const c=upgradeDraftToV2(course),hit=findScreen(c,screenId);if(!hit)return {ok:false,message:"המסך לא נמצא."};
  const screen=hit.screen,definition=TEMPLATES[template],starter=defaultScreen(template),slots:Record<string,Component[]>={};
  for(const slot of definition.slots)slots[slot.id]=[];
  for(const [oldSlot,components] of Object.entries(screen.slots))for(const component of components){
    const fits=(slot:typeof definition.slots[number])=>slot.accepts.includes(component.type) && slots[slot.id]!.length<slot.max;
    const destination=definition.slots.find(slot=>slot.id===oldSlot && fits(slot)) ?? definition.slots.find(fits);
    if(!destination)return {ok:false,message:`לא ניתן להעביר את הרכיב ״${COMPONENT_LABEL[component.type]}״ לתבנית זו בלי להסירו. העבירו אותו למסך אחר תחילה.`};
    slots[destination.id]!.push(component);
  }
  for(const slot of definition.slots)for(const component of starter.slots[slot.id] ?? []){if(slots[slot.id]!.length>=slot.min)break;slots[slot.id]!.push(component);}
  screen.template=template;screen.slots=slots;
  const ids=new Set(Object.values(slots).flat().map(c=>c.id));screen.flow.rules.push(...starter.flow.rules.filter(rule=>"componentId" in rule.when && ids.has(rule.when.componentId)));
  return {ok:true,course:c};
}
