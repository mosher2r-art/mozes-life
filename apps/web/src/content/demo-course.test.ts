import { describe, expect, it } from "vitest";
import { Course, flattenScreens, screenComponents } from "@mozes/content-schema";
import { start, step, summarize, type PlayerEvent, type PlayerState } from "@mozes/player-core";
import { validateCourse } from "@mozes/validator";
import { DEMO_MEDIA, demoCourse } from "./demo-course";

const course = Course.parse(demoCourse);
const play = (s: PlayerState, ...events: PlayerEvent[]) => events.reduce((acc, e) => step(course, acc, e), s);

describe("demo course", () => {
  it("passes technical validation with no errors or warnings", () => {
    const r = validateCourse(demoCourse);
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("covers all nine templates", () => {
    expect(new Set(flattenScreens(course).map((r) => r.screen.template)).size).toBe(9);
  });

  it("references only media that exists", () => {
    for (const { screen } of flattenScreens(course))
      for (const c of screenComponents(screen))
        for (const ref of ["media", "captions", "poster"] as const)
          if (ref in c && (c as Record<string, unknown>)[ref]) {
            const id = ((c as Record<string, unknown>)[ref] as { assetId: string }).assetId;
            expect(DEMO_MEDIA[id], `${c.id}.${ref}`).toBeDefined();
          }
  });

  it("can be completed through the remediation branch", () => {
    const s = play(
      start(course),
      { type: "continue" }, // intro
      { type: "continue" }, // text
      { type: "continue" }, // media-text
      { type: "media_progress", componentId: "vid", percent: 85 },
      { type: "continue" },
      { type: "answer", componentId: "q1", response: { type: "choiceQuestion", optionIds: ["q1-a"] } },
      { type: "continue" },
      { type: "answer", componentId: "q2", response: { type: "choiceQuestion", optionIds: ["q2-a", "q2-b"] } },
      { type: "continue" },
      { type: "answer", componentId: "q3", response: { type: "trueFalse", value: true } },
      { type: "continue" },
      { type: "answer", componentId: "sc-q", response: { type: "choiceQuestion", optionIds: ["sc-explain"] } },
      { type: "continue" },
    );
    expect(s.currentScreenId).toBe("branch-explain");
    const end = play(
      s,
      { type: "continue" },
      { type: "answer", componentId: "hs", response: { type: "hotspotImage", hotspotIds: ["door-top", "door-side"] } },
      { type: "continue" },
      { type: "answer", componentId: "seq", response: { type: "sequenceTask", order: ["s1", "s2", "s3", "s4"] } },
      { type: "continue" },
      { type: "continue" },
    );
    expect(end.finished).toBe(true);
    expect(summarize(course, end)).toMatchObject({ status: "passed", scorePercent: 100 });
  });
});
