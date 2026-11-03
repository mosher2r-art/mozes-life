import { describe, expect, it } from "vitest";
import { Course } from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import * as ops from "./ops";

const base = () =>
  Course.parse({
    schema: "mozes-course",
    schemaVersion: 1,
    id: "c-test",
    title: "קורס",
    locale: "he",
    units: [{ id: "u-1", title: "יחידה", screens: [] }],
  });

describe("editor ops", () => {
  it("never mutates the input", () => {
    const c = base();
    const snap = JSON.stringify(c);
    ops.addScreen(c, "u-1", "text");
    ops.addUnit(c);
    expect(JSON.stringify(c)).toBe(snap);
  });

  it("creates every authorable template as a valid screen", () => {
    let c = base();
    for (const t of ops.AUTHORABLE_TEMPLATES) c = ops.addScreen(c, "u-1", t).course;
    const r = validateCourse(c);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("deleting a screen repairs links that pointed to it", () => {
    let c = base();
    const a = ops.addScreen(c, "u-1", "question");
    c = a.course;
    const b = ops.addScreen(c, "u-1", "text");
    c = b.course;
    const q = ops.findScreen(c, a.screenId)!.screen.slots.question![0]!;
    if (q.type !== "choiceQuestion") throw new Error();
    c = ops.setChoiceBranch(c, a.screenId, q.id, q.options[1]!.id, { kind: "goto", screenId: b.screenId });
    c = ops.updateScreen(c, a.screenId, (s) => (s.flow.default = { kind: "goto", screenId: b.screenId }));
    c = ops.deleteScreen(c, b.screenId);
    const s = ops.findScreen(c, a.screenId)!.screen;
    expect(s.flow.default).toEqual({ kind: "next" });
    expect(s.flow.rules).toEqual([]);
    expect(validateCourse(c).issues.filter((i) => i.code === "BROKEN_LINK")).toEqual([]);
  });

  it("duplicates a screen with fresh ids and remapped branch rules", () => {
    let c = base();
    const a = ops.addScreen(c, "u-1", "question");
    c = a.course;
    const q = ops.findScreen(c, a.screenId)!.screen.slots.question![0]!;
    if (q.type !== "choiceQuestion") throw new Error();
    c = ops.setChoiceBranch(c, a.screenId, q.id, q.options[0]!.id, { kind: "end" });
    const d = ops.duplicateScreen(c, a.screenId);
    const copy = ops.findScreen(d.course, d.screenId)!.screen;
    const cq = copy.slots.question![0]!;
    if (cq.type !== "choiceQuestion") throw new Error();
    expect(cq.id).not.toBe(q.id);
    if (!("componentId" in copy.flow.rules[0]!.when)) throw new Error();
    expect(copy.flow.rules[0]!.when.componentId).toBe(cq.id);
    expect(copy.flow.rules[0]!.when.outcome).toEqual({ choice: cq.options[0]!.id });
    expect(validateCourse(d.course).issues.filter((i) => i.code === "DUPLICATE_ID")).toEqual([]);
  });

  it("moves screens and components and respects bounds", () => {
    let c = base();
    const a = ops.addScreen(c, "u-1", "text");
    c = a.course;
    const b = ops.addScreen(c, "u-1", "summary");
    c = ops.moveScreen(b.course, b.screenId, -1);
    expect(c.units[0]!.screens.map((s) => s.id)).toEqual([b.screenId, a.screenId]);
    expect(ops.moveScreen(c, b.screenId, -1).units[0]!.screens[0]!.id).toBe(b.screenId);
  });

  it("converts rich text to plain text and back", () => {
    const text = "פסקה ראשונה\n\n- פריט א\n- פריט ב\n\nפסקה אחרונה";
    expect(ops.blocksToText(ops.textToBlocks(text))).toBe(text);
    expect(ops.textToBlocks(text)[1]).toMatchObject({ kind: "list" });
  });

  it("creates media templates from a chosen file and keeps unsupported types out", () => {
    let c = base();
    const video = { id: "a-vid", kind: "video" as const, altText: "" };
    const image = { id: "a-img", kind: "image" as const, altText: "תיאור" };
    c = ops.addScreen(c, "u-1", "video", video).course;
    c = ops.addScreen(c, "u-1", "scenario", video).course;
    c = ops.addScreen(c, "u-1", "media_text", image).course;
    c = ops.addScreen(c, "u-1", "cinematic_intro", image).course;
    expect(validateCourse(c).issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(ops.addScreen(c, "u-1", "video").course.units[0]!.screens.at(-1)!.slots.video?.[0]).toMatchObject({media:{placeholder:{description:expect.any(String)}}});
    expect(ops.allowedToAdd("text", "body")).toContain("audio");
    expect(ops.allowedToAdd("hotspot", "task")).toContain("hotspotImage");
    const hotspot = ops.defaultScreen("hotspot",image);
    expect(hotspot.slots.task?.[0]?.type).toBe("hotspotImage");
  });
});
