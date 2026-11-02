import { describe, expect, it } from "vitest";
import { Course } from "@mozes/content-schema";
import { canContinue, reconcile, start, step, summarize } from "./engine";
import { PlayerEventSchema } from "./events";

function course(drops = true) {
  return Course.parse({ schema: "mozes-course", schemaVersion: 1, id: "c", title: "בדיקת סצנה", locale: "he", units: [{ id: "u", title: "פרק", screens: [{ id: "s", title: "מסך", template: "text", slots: { body: [{ id: "scene", type: "interactiveScene", scene: { type: "scene", title: "מסך", objects: drops ? [
    { id: "a", kind: "drag", text: "נכון", x: 0, y: 0, w: 40, h: 10 }, { id: "b", kind: "drag", text: "אחר", x: 0, y: 20, w: 40, h: 10 }, { id: "d", kind: "drop", text: "יעד", accept: "a", x: 50, y: 0, w: 40, h: 10 },
  ] : [{ id: "n", kind: "button", text: "המשך", x: 0, y: 0, w: 40, h: 10 }], states: [{ changes: [] }, { changes: [] }, { changes: [] }] } }] } }] }] });
}
describe("interactive scene events", () => {
  it("blocks skipping required interaction and checks the match on the server", () => {
    const c = course(); const initial = start(c);
    expect(canContinue(c, initial)).toBe(false);
    expect(() => step(c, initial, { type: "continue" })).toThrow("SCREEN_INCOMPLETE");
    expect(() => step(c, initial, { type: "scene_advance", componentId: "scene" })).toThrow("SCREEN_INCOMPLETE");
    expect(step(c, initial, { type: "scene_drop", componentId: "scene", objectId: "b", targetId: "d" })).toBe(initial);
    expect(initial.scenes).toBeUndefined();
  });
  it("persists a correct match, resumes it and does not advance twice for a duplicate event", () => {
    const c = course(); const event = { type: "scene_drop", componentId: "scene", objectId: "a", targetId: "d" } as const;
    const saved = step(c, start(c), event);
    expect(saved.scenes?.scene).toEqual({ step: 1, matches: { d: "a" } });
    expect(step(c, saved, event)).toBe(saved);
    let resumed = reconcile(c, JSON.parse(JSON.stringify(saved)));
    expect(canContinue(c, resumed)).toBe(false);
    resumed = step(c, resumed, { type: "scene_advance", componentId: "scene" });
    expect(canContinue(c, resumed)).toBe(true);
    expect(summarize(c, step(c, resumed, { type: "continue" })).status).toBe("completed");
  });
  it("requires every reveal state and preserves legacy progress without a scenes field", () => {
    const c = course(false); let saved = reconcile(c, start(c));
    expect(saved.scenes).toBeUndefined();
    saved = step(c, saved, { type: "scene_advance", componentId: "scene" });
    expect(canContinue(c, saved)).toBe(false);
    saved = step(c, saved, { type: "scene_advance", componentId: "scene" });
    expect(canContinue(c, saved)).toBe(true);
  });
  it("rejects foreign ids and invalid event fields", () => {
    const c = course();
    expect(() => step(c, start(c), { type: "scene_drop", componentId: "scene", objectId: "a", targetId: "other" })).toThrow("UNKNOWN_COMPONENT");
    expect(PlayerEventSchema.safeParse({ type: "scene_drop", componentId: "scene", objectId: "a", targetId: "d", correct: true }).success).toBe(false);
  });
});
