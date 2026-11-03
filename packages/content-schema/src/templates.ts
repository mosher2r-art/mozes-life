import type { ComponentType, TemplateId } from "./schema";
import { TEMPLATES as V1_TEMPLATES } from "./templates-v1";
export interface SlotDef { id: string; label: string; accepts: readonly ComponentType[]; min: number; max: number }
export interface TemplateDef { id: TemplateId; label: string; description: string; slots: readonly SlotDef[] }
const bodyTypes: ComponentType[] = ["heading", "richText", "callout", "image", "video", "audio", "button", "interactiveScene", "animation", "reveal", "hotspotExplore", "simulation"];
export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  ...V1_TEMPLATES,
  ...Object.fromEntries(Object.entries(V1_TEMPLATES).map(([key, template]) => [key, { ...template, slots: template.slots.map(slot => ({ ...slot, ...(slot.id === "body" ? { accepts: [...new Set([...slot.accepts, ...bodyTypes])], max: 30 } : {}), ...(slot.id === "question" ? { accepts: ["choiceQuestion", "trueFalse", "hotspotImage", "sequenceTask", "hotspotExplore"] } : {}), ...(slot.id === "media" || slot.id === "background" ? { accepts: [...slot.accepts, "animation"] } : {}) })) }])),
  decision: { id: "decision", label: "החלטה בתרחיש", description: "רקע, תיאור מצב ו־2–4 בחירות המובילות למסכי תוצאה", slots: [
    { id: "media", label: "רקע", accepts: ["image", "video", "animation"], min: 1, max: 1 },
    { id: "intro", label: "תיאור מצב", accepts: ["heading", "richText", "callout"], min: 1, max: 3 },
    { id: "decision", label: "בחירה", accepts: ["choiceQuestion"], min: 1, max: 1 },
  ] },
};
export function getTemplate(id: TemplateId) { return TEMPLATES[id]; }
export function templatesForVersion(version: 1 | 2) { return version === 1 ? V1_TEMPLATES : TEMPLATES; }
