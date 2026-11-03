import { describe, expect, it } from "vitest";
import { Course, ChapterFile, chapterDocument, readChapterFile } from "./index";
import { Course as FrozenCourse } from "./v1";
const text = { id: "body", type: "richText", body: [{ kind: "paragraph", content: [{ text: "בדיקת תוכנה" }] }] };
const chapter = { schema: "mozes-chapter", schemaVersion: 2, title: "דוגמת v2", kind: "lesson", screens: [{ id: "screen", title: "מסך", template: "text", slots: { body: [text] }, required: true }] };
describe("versioned contract", () => {
  it("reads and exports v2 without disguising its version", () => { const read = readChapterFile(chapter); expect(read.ok).toBe(true); if (!read.ok) return; expect(read.chapters[0]!.schemaVersion).toBe(2); expect(Course.parse(chapterDocument("c", "u", read.chapters[0]!)).schemaVersion).toBe(2); });
  it("keeps the v1 parse result identical to the frozen parser", () => { const v1 = { schema: "mozes-course", schemaVersion: 1, id: "c", title: "v1", locale: "he", units: [{ id: "u", title: "u", screens: [{ ...chapter.screens[0], slots: { body: [text] } }] }] }; expect(Course.parse(v1)).toEqual(FrozenCourse.parse(v1)); });
  it("rejects every unknown version", () => { expect(ChapterFile.safeParse({ ...chapter, schemaVersion: 3 }).success).toBe(false); expect(Course.safeParse({ schemaVersion: 0 }).success).toBe(false); });
  it("allows explicit placeholder references, but never invented shapes", () => { const c = structuredClone(chapter); c.screens[0]!.slots.body = [{ id: "image", type: "image", media: { placeholder: { requestId: "request", description: "תמונה חסרה" } }, alt: "תיאור" }] as unknown as typeof c.screens[0]["slots"]["body"]; expect(ChapterFile.safeParse(c).success).toBe(true); (c.screens[0]!.slots.body[0] as unknown as { media: unknown }).media = { assetId: "fake", placeholder: { requestId: "request", description: "both" } }; expect(ChapterFile.safeParse(c).success).toBe(false); });
  it("never registers an AED simulator implicitly", () => { const c = structuredClone(chapter); c.screens[0]!.slots.body = [{ id: "sim", type: "simulation", module: "aed", moduleVersion: 1, config: { deviceModelId: "unknown", scenario: "shockable" }, completion: { required: true } }] as unknown as typeof c.screens[0]["slots"]["body"]; expect(ChapterFile.safeParse(c).success).toBe(false); });
});
