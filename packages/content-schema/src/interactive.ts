import { z } from "zod";

const SceneId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const geometry = { id: SceneId, x: z.number().min(0).max(100), y: z.number().min(0).max(100), w: z.number().positive().max(100), h: z.number().positive().max(100) };
const imageSource = z.string().max(5_000_000).refine(value => {
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "תמונה חייבת להיות בקישור HTTPS או תמונת PNG/JPEG/WebP/GIF מוטמעת");
const text = { text: z.string().max(5000), font_size: z.number().min(8).max(120).optional() };
export const SceneObject = z.discriminatedUnion("kind", [
  z.object({ ...geometry, kind: z.literal("image"), src: imageSource, alt: z.string().max(5000).default(""), fit: z.enum(["contain", "cover", "fill"]).default("contain"), opacity: z.number().min(0).max(1).optional(), animation: z.enum(["Pulse"]).optional() }).strict(),
  z.object({ ...geometry, ...text, kind: z.literal("button") }).strict(),
  z.object({ ...geometry, ...text, kind: z.literal("drag") }).strict(),
  z.object({ ...geometry, ...text, kind: z.literal("drop"), accept: SceneId }).strict(),
]);
export const ScenePage = z.object({
  type: z.literal("scene"), title: z.string().trim().min(1).max(120),
  objects: z.array(SceneObject).min(1).max(100),
  states: z.array(z.object({ changes: z.array(z.object({ id: SceneId, opacity: z.number().min(0).max(1), duration: z.number().min(0).max(30000).optional() }).strict()).max(100), auto_ms: z.number().min(100).max(60000).optional() }).strict()).max(200).default([]),
}).strict().superRefine((page, ctx) => {
  const ids = new Set(page.objects.map(o => o.id));
  if (ids.size !== page.objects.length) ctx.addIssue({ code: "custom", message: "מזהי רכיבים כפולים במסך" });
  for (const o of page.objects) if (o.kind === "drop" && !page.objects.some(d => d.kind === "drag" && d.id === o.accept)) ctx.addIssue({ code: "custom", message: `אזור הגרירה ${o.id} מפנה לתשובה חסרה` });
  for (const state of page.states) for (const change of state.changes) if (!ids.has(change.id)) ctx.addIssue({ code: "custom", message: `מצב מפנה לרכיב חסר: ${change.id}` });
});
export type ScenePage = z.infer<typeof ScenePage>;
export type SceneObject = z.infer<typeof SceneObject>;
export const InteractiveChapter = z.object({
  format: z.literal("mozes-interactive-chapter"), version: z.literal(1),
  chapter: z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).optional(), pages: z.array(ScenePage).min(1).max(200) }).strict(),
}).strict();
