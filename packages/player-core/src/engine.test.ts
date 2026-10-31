import { describe, expect, it } from "vitest";
import { Component, Course, type QuestionComponent } from "@mozes/content-schema";

const Q = (x: unknown) => Component.parse(x) as QuestionComponent;
import { canContinue, EngineError, reconcile, resolveTarget, start, step, summarize, type PlayerState } from "./engine";
import { fixture as course, fixtureInput } from "./fixtures";
import { grade, InvalidResponseError } from "./grading";

const choose = (componentId: string, ...optionIds: string[]) =>
  ({ type: "answer", componentId, response: { type: "choiceQuestion", optionIds } }) as const;

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`expected EngineError ${code}`);
}

const run = (s: PlayerState, ...events: Parameters<typeof step>[2][]) => events.reduce((acc, e) => step(course, acc, e), s);

describe("start", () => {
  it("starts at the first screen", () => {
    const s = start(course);
    expect(s.currentScreenId).toBe("s-intro");
    expect(s.visited).toEqual(["s-intro"]);
  });
  it("rejects an empty course", () => {
    const empty = Course.parse({ ...fixtureInput, units: [] });
    expectCode(() => start(empty), "EMPTY_COURSE");
  });
});

describe("questions", () => {
  it("blocks continue until the question is resolved", () => {
    const s = run(start(course), { type: "continue" });
    expect(s.currentScreenId).toBe("s-q");
    expect(canContinue(course, s)).toBe(false);
    expectCode(() => step(course, s, { type: "continue" }), "SCREEN_INCOMPLETE");
  });

  it("allows a retry, then resolves after max attempts and locks", () => {
    let s = run(start(course), { type: "continue" }, choose("q1", "o-red"));
    expect(s.questions.q1).toMatchObject({ attempts: 1, correct: false, resolved: false });
    s = step(course, s, choose("q1", "o-red"));
    expect(s.questions.q1).toMatchObject({ attempts: 2, correct: false, resolved: true, earned: 0 });
    expectCode(() => step(course, s, choose("q1", "o-green")), "QUESTION_LOCKED");
    expect(canContinue(course, s)).toBe(true);
  });

  it("awards points on a correct answer", () => {
    const s = run(start(course), { type: "continue" }, choose("q1", "o-green"));
    expect(s.questions.q1).toMatchObject({ resolved: true, correct: true, earned: 2 });
  });

  it("rejects answers for components not on the current screen", () => {
    expectCode(() => step(course, start(course), choose("q1", "o-green")), "UNKNOWN_COMPONENT");
    expectCode(() => step(course, start(course), choose("h1", "x")), "NOT_A_QUESTION");
  });

  it("does not mutate the input state", () => {
    const s0 = run(start(course), { type: "continue" });
    const snapshot = JSON.stringify(s0);
    step(course, s0, choose("q1", "o-green"));
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe("branching", () => {
  const atScenario = () => run(start(course), { type: "continue" }, choose("q1", "o-green"), { type: "continue" });

  it("follows the default path", () => {
    const s = step(course, atScenario(), choose("d1", "o-a"));
    expect(resolveTarget(course, s)).toEqual({ kind: "next" });
    expect(step(course, s, { type: "continue" }).currentScreenId).toBe("s-video");
  });

  it("follows a choice rule to another screen and back into the path", () => {
    let s = step(course, atScenario(), choose("d1", "o-b"));
    s = step(course, s, { type: "continue" });
    expect(s.currentScreenId).toBe("s-explain");
    s = step(course, s, { type: "continue" });
    expect(s.currentScreenId).toBe("s-video");
  });
});

describe("media", () => {
  it("requires the configured watch percentage and keeps the maximum", () => {
    let s = run(start(course), { type: "continue" }, choose("q1", "o-green"), { type: "continue" }, choose("d1", "o-a"), { type: "continue" });
    expect(s.currentScreenId).toBe("s-video");
    s = step(course, s, { type: "media_progress", componentId: "v1", percent: 50 });
    expect(canContinue(course, s)).toBe(false);
    s = step(course, s, { type: "media_progress", componentId: "v1", percent: 95 });
    s = step(course, s, { type: "media_progress", componentId: "v1", percent: 10 });
    expect(s.media.v1).toBe(95);
    expect(canContinue(course, s)).toBe(true);
  });
});

describe("navigation", () => {
  it("back returns to the previous screen", () => {
    const s = run(start(course), { type: "continue" }, { type: "back" });
    expect(s.currentScreenId).toBe("s-intro");
    expectCode(() => step(course, s, { type: "back" }), "NO_HISTORY");
  });

  it("goto is refused in linear courses", () => {
    expectCode(() => step(course, start(course), { type: "goto", screenId: "s-intro" }), "NAVIGATION_NOT_ALLOWED");
  });

  it("goto works for visited screens in free navigation", () => {
    const free = Course.parse({ ...fixtureInput, settings: { navigation: "free_after_visit" } });
    let s = step(free, start(free), { type: "continue" });
    s = step(free, s, { type: "goto", screenId: "s-intro" });
    expect(s.currentScreenId).toBe("s-intro");
    expectCode(() => step(free, s, { type: "goto", screenId: "s-summary" }), "NAVIGATION_NOT_ALLOWED");
  });
});

describe("completion", () => {
  const playThrough = (q1: string) =>
    run(
      start(course),
      { type: "continue" },
      choose("q1", q1),
      ...(q1 === "o-red" ? [choose("q1", "o-red")] : []),
      { type: "continue" },
      choose("d1", "o-a"),
      { type: "continue" },
      { type: "media_progress", componentId: "v1", percent: 100 },
      { type: "continue" },
      { type: "continue" },
    );

  it("passes when the score meets the threshold", () => {
    const s = playThrough("o-green");
    expect(s.finished).toBe(true);
    const sum = summarize(course, s);
    expect(sum).toMatchObject({ status: "passed", scorePercent: 100, earned: 2, possible: 2, progressPercent: 100 });
    expectCode(() => step(course, s, { type: "continue" }), "COURSE_FINISHED");
  });

  it("fails when the score is below the threshold", () => {
    expect(summarize(course, playThrough("o-red"))).toMatchObject({ status: "failed", scorePercent: 0 });
  });

  it("is in progress before the end", () => {
    expect(summarize(course, start(course)).status).toBe("in_progress");
  });
});

describe("reconcile", () => {
  it("drops unknown ids and repairs the current screen", () => {
    const saved: PlayerState = {
      ...start(course),
      currentScreenId: "deleted-screen",
      visited: ["s-intro", "deleted-screen"],
      history: ["s-intro", "deleted-screen"],
      questions: { gone: { attempts: 1, correct: true, resolved: true, lastResponse: null, earned: 1 } },
    };
    const r = reconcile(course, saved);
    expect(r.currentScreenId).toBe("s-intro");
    expect(r.visited).toEqual(["s-intro"]);
    expect(r.history).toEqual(["s-intro"]);
    expect(r.questions).toEqual({});
  });
});

describe("grade", () => {
  const q = course.units[0]!.screens[1]!.slots.question![0]!;
  it("rejects malformed responses", () => {
    if (q.type !== "choiceQuestion") throw new Error("fixture");
    expect(() => grade(q, { type: "choiceQuestion", optionIds: [] })).toThrow(InvalidResponseError);
    expect(() => grade(q, { type: "choiceQuestion", optionIds: ["nope"] })).toThrow(InvalidResponseError);
    expect(() => grade(q, { type: "choiceQuestion", optionIds: ["o-green", "o-red"] })).toThrow(InvalidResponseError);
    expect(() => grade(q, { type: "trueFalse", value: true })).toThrow(InvalidResponseError);
  });

  it("grades multiple choice, true/false, hotspots and sequences", () => {
    const multi = Q({ id: "m", type: "choiceQuestion", prompt: "p", mode: "multiple", shuffle: false, points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true, feedback: { correct: "", incorrect: "" },
      options: [ { id: "a", text: "a", correct: true }, { id: "b", text: "b", correct: true }, { id: "c", text: "c", correct: false } ] });
    expect(grade(multi, { type: "choiceQuestion", optionIds: ["b", "a"] })).toBe(true);
    expect(grade(multi, { type: "choiceQuestion", optionIds: ["a"] })).toBe(false);
    expect(grade(multi, { type: "choiceQuestion", optionIds: ["a", "b", "c"] })).toBe(false);

    const tf = Q({ id: "t", type: "trueFalse", prompt: "p", answer: false, points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true, feedback: { correct: "", incorrect: "" } });
    expect(grade(tf, { type: "trueFalse", value: false })).toBe(true);

    const hs = Q({ id: "h", type: "hotspotImage", prompt: "p", media: { assetId: "x" }, alt: "x", mode: "all", points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true, feedback: { correct: "", incorrect: "" },
      hotspots: [ { id: "1", label: "1", correct: true, shape: { kind: "circle", cx: 10, cy: 10, r: 5 } }, { id: "2", label: "2", correct: true, shape: { kind: "rect", x: 1, y: 1, w: 5, h: 5 } }, { id: "3", label: "3", correct: false, shape: { kind: "circle", cx: 50, cy: 50, r: 5 } } ] });
    expect(grade(hs, { type: "hotspotImage", hotspotIds: ["2", "1"] })).toBe(true);
    expect(grade(hs, { type: "hotspotImage", hotspotIds: ["1"] })).toBe(false);

    const seq = Q({ id: "s", type: "sequenceTask", prompt: "p", points: 1, maxAttempts: 1, showCorrectAfterFinalAttempt: true, feedback: { correct: "", incorrect: "" },
      items: [ { id: "x", text: "x" }, { id: "y", text: "y" }, { id: "z", text: "z" } ] });
    expect(grade(seq, { type: "sequenceTask", order: ["x", "y", "z"] })).toBe(true);
    expect(grade(seq, { type: "sequenceTask", order: ["y", "x", "z"] })).toBe(false);
    expect(() => grade(seq, { type: "sequenceTask", order: ["x", "x", "z"] })).toThrow(InvalidResponseError);
  });
});
