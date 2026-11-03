/**
 * Screen templates. A template defines named slots; each slot restricts which
 * component types it accepts and how many. Renderers lay slots out responsively,
 * so authors never position elements by hand.
 */
import type { ComponentType, TemplateId } from "./schema-v1";

export interface SlotDef {
  id: string;
  label: string; // Hebrew, shown in the editor
  accepts: readonly ComponentType[];
  min: number;
  max: number;
}

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
  slots: readonly SlotDef[];
}

const TEXTUAL = ["heading", "richText", "callout"] as const;

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  cinematic_intro: {
    id: "cinematic_intro",
    label: "מסך פתיחה קולנועי",
    description: "רקע תמונה או וידאו עם כותרת ופתיח קצר",
    slots: [
      { id: "background", label: "רקע", accepts: ["image", "video"], min: 1, max: 1 },
      { id: "title", label: "כותרת", accepts: ["heading"], min: 1, max: 1 },
      { id: "body", label: "פתיח", accepts: ["richText"], min: 0, max: 1 },
      { id: "action", label: "כפתור", accepts: ["button"], min: 0, max: 1 },
    ],
  },
  text: {
    id: "text",
    label: "טקסט והסבר",
    description: "כותרות, טקסט והדגשות",
    slots: [
      { id: "body", label: "תוכן", accepts: [...TEXTUAL, "audio", "button", "interactiveScene"], min: 1, max: 12 },
    ],
  },
  media_text: {
    id: "media_text",
    label: "תמונה וטקסט",
    description: "מדיה לצד טקסט במחשב, אחד מעל השני בנייד",
    slots: [
      { id: "media", label: "מדיה", accepts: ["image", "video"], min: 1, max: 1 },
      { id: "body", label: "תוכן", accepts: [...TEXTUAL, "audio"], min: 1, max: 8 },
    ],
  },
  video: {
    id: "video",
    label: "וידאו",
    description: "סרטון עם כותרת והסבר",
    slots: [
      { id: "video", label: "סרטון", accepts: ["video"], min: 1, max: 1 },
      { id: "body", label: "תוכן", accepts: TEXTUAL, min: 0, max: 6 },
    ],
  },
  question: {
    id: "question",
    label: "שאלה",
    description: "שאלת בחירה או נכון/לא נכון עם משוב",
    slots: [
      { id: "intro", label: "הקדמה", accepts: [...TEXTUAL, "image"], min: 0, max: 4 },
      { id: "question", label: "שאלה", accepts: ["choiceQuestion", "trueFalse"], min: 1, max: 1 },
    ],
  },
  scenario: {
    id: "scenario",
    label: "תרחיש",
    description: "סרטון או תמונה, ואז בחירת פעולה שמשפיעה על המשך הלמידה",
    slots: [
      { id: "media", label: "תרחיש", accepts: ["video", "image"], min: 1, max: 1 },
      { id: "intro", label: "תיאור", accepts: TEXTUAL, min: 0, max: 3 },
      { id: "decision", label: "החלטה", accepts: ["choiceQuestion"], min: 1, max: 1 },
    ],
  },
  hotspot: {
    id: "hotspot",
    label: "זיהוי נקודות על תמונה",
    description: "הלומד מסמן אזורים בתמונה",
    slots: [
      { id: "intro", label: "הקדמה", accepts: TEXTUAL, min: 0, max: 3 },
      { id: "task", label: "משימה", accepts: ["hotspotImage"], min: 1, max: 1 },
    ],
  },
  sequence: {
    id: "sequence",
    label: "סידור פעולות",
    description: "הלומד מסדר שלבים בסדר הנכון",
    slots: [
      { id: "intro", label: "הקדמה", accepts: TEXTUAL, min: 0, max: 3 },
      { id: "task", label: "משימה", accepts: ["sequenceTask"], min: 1, max: 1 },
    ],
  },
  summary: {
    id: "summary",
    label: "סיכום והערכה",
    description: "סיכום, ציון ותוצאה",
    slots: [{ id: "body", label: "תוכן", accepts: [...TEXTUAL, "button"], min: 0, max: 8 }],
  },
};

export function getTemplate(id: TemplateId): TemplateDef {
  return TEMPLATES[id];
}
