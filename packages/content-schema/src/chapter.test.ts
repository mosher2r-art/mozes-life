import { describe, expect, it } from "vitest";
import { ChapterFile, Course, chapterDocument, composeCourse, readChapterFile, remapIds, toChapterFile } from "./index";

const file = {
  schema: "mozes-chapter",
  schemaVersion: 1,
  title: "מבחן",
  kind: "exam",
  screens: [
    {
      id: "s1",
      title: "שאלה",
      template: "question",
      slots: {
        question: [{ id: "q1", type: "choiceQuestion", prompt: "?", mode: "single", options: [{ id: "o1", text: "א", correct: true }, { id: "o2", text: "ב", correct: false }] }],
      },
      flow: { default: { kind: "next" }, rules: [{ id: "r1", when: { componentId: "q1", outcome: { choice: "o2" } }, then: { kind: "goto", screenId: "s2" } }] },
    },
    { id: "s2", title: "הסבר", template: "text", slots: { body: [{ id: "h", type: "heading", text: "x", level: 1 }, { id: "img", type: "image", media: { assetId: "a-1" }, alt: "" }] } },
  ],
};

describe("chapter files", () => {
  it("reads a mozes-chapter file", () => {
    const r = readChapterFile(file);
    expect(r.ok && r.chapters[0]!.kind).toBe("exam");
  });
  it("splits a mozes-course file into one chapter per non-empty unit", () => {
    const doc = Course.parse(chapterDocument("c", "u", ChapterFile.parse(file)));
    const course = { ...doc, units: [...doc.units, { id: "u2", title: "ריקה", kind: "lesson", screens: [] }] };
    const r = readChapterFile(course);
    expect(r.ok && r.chapters.map((c) => c.title)).toEqual(["מבחן"]);
  });
  it("rejects unknown and invalid files with a Hebrew reason", () => {
    expect(readChapterFile({ hello: 1 })).toMatchObject({ ok: false });
    const bad = readChapterFile({ ...file, screens: [{ ...file.screens[0], slots: { question: [{ id: "x", type: "script" }] } }] });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toMatch(/מבנה הקובץ/);
  });
  it("round-trips through the bank document", () => {
    const parsed = ChapterFile.parse(file);
    const doc = Course.parse(chapterDocument("ch-1", "u-1", parsed));
    expect(toChapterFile(doc)).toEqual(parsed);
  });
});

describe("remapIds", () => {
  it("renames every id and rewrites references, but never media", () => {
    let n = 0;
    const out = remapIds(file, () => `n${++n}`);
    const json = JSON.stringify(out);
    for (const old of ['"s1"', '"s2"', '"q1"', '"o2"', '"r1"']) expect(json).not.toContain(old);
    const rule = out.screens[0]!.flow!.rules[0]!;
    expect(rule.then).toEqual({ kind: "goto", screenId: out.screens[1]!.id });
    expect(rule.when.componentId).toBe(out.screens[0]!.slots.question![0]!.id);
    expect(json).toContain('"assetId":"a-1"');
    expect(ChapterFile.safeParse(out).success).toBe(true);
  });
  it("leaves dangling references untouched so validation can report them", () => {
    const dangling = { id: "a", then: { kind: "goto", screenId: "missing" } };
    expect(remapIds(dangling, () => "z").then.screenId).toBe("missing");
  });
});

describe("composeCourse", () => {
  it("turns chapters into units, in order, with their kind", () => {
    const a = Course.parse(chapterDocument("ch-a", "u-a", { ...ChapterFile.parse(file), kind: "lesson", title: "שיעור" }));
    const b = Course.parse(chapterDocument("ch-b", "u-b", remapIds(ChapterFile.parse(file), (o) => `b-${o}`)));
    const course = Course.parse(composeCourse({ id: "c-1", title: "קורס", passingScore: 80, chapters: [{ title: "שיעור", kind: "lesson", doc: a }, { title: "מבחן סופי", kind: "exam", doc: b }] }));
    expect(course.units.map((u) => [u.id, u.title, u.kind])).toEqual([["u-a", "שיעור", "lesson"], ["u-b", "מבחן סופי", "exam"]]);
    expect(course.settings.completion.passingScore).toBe(80);
  });
});
