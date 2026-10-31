import { describe, expect, it } from "vitest";
import { Component, SafeUrl, TEMPLATE_IDS, TEMPLATES } from "./index";

describe("templates", () => {
  it("defines every template id with unique slot ids", () => {
    for (const id of TEMPLATE_IDS) {
      const t = TEMPLATES[id];
      expect(t.id).toBe(id);
      const slots = t.slots.map((s) => s.id);
      expect(new Set(slots).size).toBe(slots.length);
      for (const s of t.slots) expect(s.min).toBeLessThanOrEqual(s.max);
    }
  });
});

describe("SafeUrl", () => {
  it.each(["https://mozes.example", "mailto:a@b.co"])("accepts %s", (u) => expect(SafeUrl.safeParse(u).success).toBe(true));
  it.each(["javascript:alert(1)", "data:text/html,x", "vbscript:x", "not a url", "//evil"])("rejects %s", (u) =>
    expect(SafeUrl.safeParse(u).success).toBe(false),
  );
});

describe("components", () => {
  it("applies defaults", () => {
    const q = Component.parse({ id: "q", type: "trueFalse", prompt: "?", answer: true });
    expect(q).toMatchObject({ points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true });
  });
  it("rejects unknown component types and extra fields", () => {
    expect(Component.safeParse({ id: "x", type: "script", src: "a.js" }).success).toBe(false);
    expect(Component.safeParse({ id: "h", type: "heading", text: "x", level: 1, onclick: "x" }).success).toBe(false);
  });
  it("does not allow unlimited attempts", () => {
    expect(Component.safeParse({ id: "q", type: "trueFalse", prompt: "?", answer: true, maxAttempts: 0 }).success).toBe(false);
    expect(Component.safeParse({ id: "q", type: "trueFalse", prompt: "?", answer: true, maxAttempts: 11 }).success).toBe(false);
  });
  it("rejects ids with unsafe characters", () => {
    expect(Component.safeParse({ id: "a b<", type: "heading", text: "x", level: 1 }).success).toBe(false);
  });
});
