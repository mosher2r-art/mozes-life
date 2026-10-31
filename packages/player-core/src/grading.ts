import type { ComponentOf, QuestionComponent } from "@mozes/content-schema";

/** Learner responses per question type. */
export type Response =
  | { type: "choiceQuestion"; optionIds: string[] }
  | { type: "trueFalse"; value: boolean }
  | { type: "hotspotImage"; hotspotIds: string[] }
  | { type: "sequenceTask"; order: string[] };

const sameSet = (a: readonly string[], b: readonly string[]) => {
  const sa = new Set(a);
  return sa.size === new Set(b).size && b.every((x) => sa.has(x)) && a.length === sa.size;
};

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

function gradeChoice(q: ComponentOf<"choiceQuestion">, r: Extract<Response, { type: "choiceQuestion" }>): boolean {
  const known = new Set(q.options.map((o) => o.id));
  if (!r.optionIds.length) throw new InvalidResponseError("no option selected");
  if (r.optionIds.some((id) => !known.has(id))) throw new InvalidResponseError("unknown option");
  if (q.mode === "single" && r.optionIds.length !== 1) throw new InvalidResponseError("single choice expects one option");
  const correct = q.options.filter((o) => o.correct).map((o) => o.id);
  return sameSet(r.optionIds, correct);
}

function gradeHotspot(q: ComponentOf<"hotspotImage">, r: Extract<Response, { type: "hotspotImage" }>): boolean {
  const known = new Set(q.hotspots.map((h) => h.id));
  if (!r.hotspotIds.length) throw new InvalidResponseError("no area selected");
  if (r.hotspotIds.some((id) => !known.has(id))) throw new InvalidResponseError("unknown hotspot");
  if (q.mode === "single" && r.hotspotIds.length !== 1) throw new InvalidResponseError("single mode expects one area");
  const correct = q.hotspots.filter((h) => h.correct).map((h) => h.id);
  return q.mode === "single" ? correct.includes(r.hotspotIds[0]!) : sameSet(r.hotspotIds, correct);
}

function gradeSequence(q: ComponentOf<"sequenceTask">, r: Extract<Response, { type: "sequenceTask" }>): boolean {
  const expected = q.items.map((i) => i.id);
  if (!sameSet(r.order, expected)) throw new InvalidResponseError("order must contain every item exactly once");
  return r.order.every((id, i) => id === expected[i]);
}

/** Returns whether the response is correct. Throws InvalidResponseError on malformed input. */
export function grade(q: QuestionComponent, r: Response): boolean {
  if (q.type !== r.type) throw new InvalidResponseError(`response type ${r.type} does not match ${q.type}`);
  switch (q.type) {
    case "choiceQuestion":
      return gradeChoice(q, r as Extract<Response, { type: "choiceQuestion" }>);
    case "trueFalse":
      return (r as Extract<Response, { type: "trueFalse" }>).value === q.answer;
    case "hotspotImage":
      return gradeHotspot(q, r as Extract<Response, { type: "hotspotImage" }>);
    case "sequenceTask":
      return gradeSequence(q, r as Extract<Response, { type: "sequenceTask" }>);
  }
}
