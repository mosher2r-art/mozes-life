import { describe, expect, it } from "vitest";
import { InteractiveChapter, ScenePage } from "./interactive";
import { chapterDocument, readChapterFile, remapIds } from "./chapter";
import { Course } from "./schema";

const page = { type: "scene", title: "בדיקת התאמה", objects: [
  { id: "picture", kind: "image", x: 0, y: 0, w: 100, h: 20, src: "data:image/png;base64,AA==", alt: "כותרת", opacity: 0, animation: "Pulse" },
  { id: "answer", kind: "drag", x: 0, y: 30, w: 40, h: 10, text: "תשובה", font_size: 13 },
  { id: "target", kind: "drop", x: 50, y: 30, w: 40, h: 10, text: "יעד", accept: "answer" },
], states: [{ changes: [] }, { changes: [{ id: "picture", opacity: 1, duration: 400 }], auto_ms: 650 }] };
const file = { format: "mozes-interactive-chapter", version: 1, chapter: { name: "פרק אינטראקטיבי", description: "תיאור מקורי", pages: [page] } };
describe("interactive chapter compatibility", () => {
  it("recognizes the original envelope and preserves scene data without replacing images or interactions", () => {
    const result = readChapterFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = Course.parse(chapterDocument("ch", "unit", result.chapters[0]!));
    const screen = parsed.units[0]!.screens[0]!;
    expect(screen.notes).toBe(file.chapter.description);
    expect(screen.slots.body?.[0]).toMatchObject({ type: "interactiveScene", scene: page });
    expect(screen.required).toBe(true);
  });
  it("remaps drag acceptance and state references together when importing another copy", () => {
    const result = readChapterFile(file); if (!result.ok) throw new Error(result.message);
    let n = 0; const remapped = remapIds(result.chapters[0]!, () => `new-${++n}`);
    const scene = remapped.screens[0]!.slots.body?.[0]; if (scene?.type !== "interactiveScene") throw new Error("Missing scene");
    const drag = scene.scene.objects.find(o => o.kind === "drag");
    expect(scene.scene.objects.find(o => o.kind === "drop")).toMatchObject({ accept: drag?.id });
    expect(scene.scene.states[1]?.changes[0]?.id).toBe(scene.scene.objects[0]?.id);
  });
  it("rejects executable image sources and unsupported objects instead of discarding them", () => {
    for (const src of ["javascript:alert(1)", "data:image/svg+xml;base64,AA==", "file:///private/image.png"]) {
      expect(ScenePage.safeParse({ ...page, objects: [{ ...page.objects[0], src }] }).success).toBe(false);
    }
    expect(ScenePage.safeParse({ ...page, objects: [{ ...page.objects[0], kind: "script" }] }).success).toBe(false);
  });
  it("rejects duplicate ids and broken state or drag targets", () => {
    expect(ScenePage.safeParse({ ...page, objects: [page.objects[0], page.objects[0]] }).success).toBe(false);
    expect(ScenePage.safeParse({ ...page, states: [{ changes: [{ id: "missing", opacity: 1 }] }] }).success).toBe(false);
    expect(ScenePage.safeParse({ ...page, objects: [{ ...page.objects[2], accept: "missing" }] }).success).toBe(false);
  });
  it("reports unsupported format versions and still accepts the existing chapter format", () => {
    expect(InteractiveChapter.safeParse({ ...file, version: 2 }).success).toBe(false);
    const result = readChapterFile(file); if (!result.ok) throw new Error(result.message);
    expect(readChapterFile(result.chapters[0]).ok).toBe(true);
  });
});
