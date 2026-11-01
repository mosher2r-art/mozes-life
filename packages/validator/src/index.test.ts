import { describe, expect, it } from "vitest";
import type { CourseInput } from "@mozes/content-schema";
import { validateCourse } from "./index";

const text = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `מסך ${id}`,
  template: "text",
  slots: { body: [{ id: `${id}-h`, type: "heading", text: "כותרת", level: 1 }] },
  ...extra,
});

const course = (screens: unknown[], more: Partial<CourseInput> = {}): CourseInput =>
  ({ schema: "mozes-course", schemaVersion: 1, id: "c", title: "קורס", locale: "he", units: [{ id: "u", title: "יחידה", screens }], ...more }) as CourseInput;

const codes = (input: unknown) => validateCourse(input).issues.map((i) => i.code);

describe("validateCourse", () => {
  it("accepts a minimal valid course", () => {
    const r = validateCourse(course([text("a"), text("b")]));
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("requires questions in exams and when a passing score is set", () => {
    const exam = { ...course([text("a")]), units: [{ id: "u", title: "מבחן", kind: "exam", screens: [text("a")] }] };
    expect(codes(exam)).toContain("EXAM_WITHOUT_QUESTIONS");
    const scored = course([text("a")], { settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: 80 } } });
    expect(codes(scored)).toContain("PASSING_SCORE_WITHOUT_QUESTIONS");
  });

  it("reports schema errors with a path instead of throwing", () => {
    const r = validateCourse({ schema: "mozes-course" });
    expect(r.ok).toBe(false);
    expect(r.issues.every((i) => i.code === "SCHEMA")).toBe(true);
  });

  it("rejects unsafe links in rich text", () => {
    const s = { ...text("a"), slots: { body: [{ id: "r", type: "richText", body: [{ kind: "paragraph", content: [{ text: "x", href: "javascript:alert(1)" }] }] }] } };
    expect(validateCourse(course([s])).ok).toBe(false);
  });

  it("rejects unknown fields (strict schema)", () => {
    const s = { ...text("a"), slots: { body: [{ id: "h", type: "heading", text: "x", level: 1, html: "<b>x</b>" }] } };
    expect(codes(course([s]))).toContain("SCHEMA");
  });

  it("detects duplicate ids", () => {
    expect(codes(course([text("a"), text("a")]))).toContain("DUPLICATE_ID");
  });

  it("enforces template slots", () => {
    expect(codes(course([{ ...text("a"), slots: {} }]))).toContain("SLOT_MIN");
    expect(codes(course([{ ...text("a"), slots: { body: [], extra: [] } }]))).toContain("UNKNOWN_SLOT");
    const wrongType = { ...text("a"), slots: { body: [{ id: "i", type: "image", media: { assetId: "x" }, alt: "x" }] } };
    expect(codes(course([wrongType]))).toContain("SLOT_TYPE");
  });

  it("checks questions", () => {
    const q = (options: unknown[], mode = "single") => ({
      id: "q", title: "ש", template: "question",
      slots: { question: [{ id: "qq", type: "choiceQuestion", prompt: "?", mode, options }] },
    });
    expect(codes(course([q([{ id: "a", text: "a", correct: false }, { id: "b", text: "b", correct: false }])]))).toContain("NO_CORRECT_OPTION");
    expect(codes(course([q([{ id: "a", text: "a", correct: true }, { id: "b", text: "b", correct: true }])]))).toContain("SINGLE_MULTIPLE_CORRECT");
    expect(codes(course([q([{ id: "a", text: "a", correct: true }, { id: "b", text: "b", correct: false }])]))).toContain("NO_FEEDBACK");
  });

  it("requires alt text unless decorative", () => {
    const img = (alt: string, decorative: boolean) => ({
      id: "m", title: "מ", template: "media_text",
      slots: { media: [{ id: "i", type: "image", media: { assetId: "x" }, alt, decorative }], body: [{ id: "h", type: "heading", text: "x", level: 2 }] },
    });
    expect(codes(course([img("", false)]))).toContain("IMAGE_ALT");
    expect(codes(course([img("", true)]))).not.toContain("IMAGE_ALT");
  });

  it("detects broken links", () => {
    expect(codes(course([text("a", { flow: { default: { kind: "goto", screenId: "nope" } } })]))).toContain("BROKEN_LINK");
  });

  it("detects unreachable screens", () => {
    const r = validateCourse(course([text("a", { flow: { default: { kind: "end" } } }), text("b")]));
    expect(r.issues.find((i) => i.code === "UNREACHABLE")?.screenId).toBe("b");
  });

  it("detects infinite loops and dead ends", () => {
    const c = course([text("a", { flow: { default: { kind: "goto", screenId: "b" } } }), text("b", { flow: { default: { kind: "goto", screenId: "a" } } })]);
    const r = validateCourse(c);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["INFINITE_LOOP", "DEAD_END"]));
  });

  it("allows a conditional 'try again' loop with an exit, flagged as info", () => {
    const decision = {
      id: "d", title: "החלטה", template: "question",
      slots: { question: [{ id: "q", type: "choiceQuestion", prompt: "?", mode: "single", maxAttempts: 1,
        feedback: { correct: "כן", incorrect: "לא" },
        options: [{ id: "ok", text: "נכון", correct: true }, { id: "again", text: "שוב", correct: false }] }] },
      flow: { default: { kind: "next" }, rules: [{ id: "r", when: { componentId: "q", outcome: { choice: "again" } }, then: { kind: "goto", screenId: "a" } }] },
    };
    const r = validateCourse(course([text("a"), decision, text("z")]));
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("INTENDED_LOOP");
  });

  it("validates branching rules", () => {
    const s = {
      ...text("a"),
      flow: { default: { kind: "next" }, rules: [{ id: "r", when: { componentId: "missing", outcome: "correct" }, then: { kind: "end" } }] },
    };
    expect(codes(course([s]))).toContain("RULE_COMPONENT");
  });

  it("lists medical screens for review", () => {
    expect(codes(course([text("a", { medical: { relevant: true } })]))).toContain("MEDICAL_REVIEW_REQUIRED");
  });
});
