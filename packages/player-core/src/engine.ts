/**
 * player-core — a pure, deterministic state machine for running a mozes-course.
 *
 *   step(course, state, event) → newState      (never mutates its inputs)
 *
 * It has no UI and no I/O, so the same engine powers the learner player, the
 * editor preview and the automated tests. State is plain JSON so it can be saved
 * and resumed.
 */
import {
  type Course,
  type FlowRule,
  type FlowTarget,
  type QuestionComponent,
  type Screen,
  findComponent,
  flattenScreens,
  isQuestion,
  screenComponents,
} from "@mozes/content-schema";
import { grade, type Response } from "./grading";

export interface QuestionState {
  attempts: number;
  /** Correctness of the latest attempt. */
  correct: boolean;
  /** True once answered correctly or attempts are exhausted. Locked afterwards. */
  resolved: boolean;
  lastResponse: Response | null;
  earned: number;
}

export interface PlayerState {
  v: 1;
  courseId: string;
  currentScreenId: string;
  /** Navigation stack for "back". */
  history: string[];
  /** Unique screen ids in first-visit order. */
  visited: string[];
  questions: Record<string, QuestionState>;
  /** componentId → highest percentage watched/listened. */
  media: Record<string, number>;
  finished: boolean;
}

export type PlayerEvent =
  | { type: "answer"; componentId: string; response: Response }
  | { type: "media_progress"; componentId: string; percent: number }
  | { type: "continue" }
  | { type: "button"; componentId: string }
  | { type: "back" }
  | { type: "goto"; screenId: string };

export type EngineErrorCode =
  | "EMPTY_COURSE"
  | "UNKNOWN_SCREEN"
  | "UNKNOWN_COMPONENT"
  | "NOT_A_QUESTION"
  | "QUESTION_LOCKED"
  | "SCREEN_INCOMPLETE"
  | "NO_HISTORY"
  | "NAVIGATION_NOT_ALLOWED"
  | "COURSE_FINISHED";

export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = "EngineError";
  }
}

/* ───────────── Lookups ───────────── */

function indexScreens(course: Course) {
  const flat = flattenScreens(course);
  const byId = new Map(flat.map((r) => [r.screen.id, r]));
  return { flat, byId };
}

function getScreen(course: Course, id: string): Screen {
  const ref = indexScreens(course).byId.get(id);
  if (!ref) throw new EngineError("UNKNOWN_SCREEN", id);
  return ref.screen;
}

/* ───────────── Start / resume ───────────── */

export function start(course: Course): PlayerState {
  const first = flattenScreens(course)[0];
  if (!first) throw new EngineError("EMPTY_COURSE");
  return {
    v: 1,
    courseId: course.id,
    currentScreenId: first.screen.id,
    history: [],
    visited: [first.screen.id],
    questions: {},
    media: {},
    finished: false,
  };
}

/**
 * Makes a saved state safe to use with (possibly) a different course version:
 * drops references to screens/components that no longer exist.
 */
export function reconcile(course: Course, saved: PlayerState): PlayerState {
  const { flat, byId } = indexScreens(course);
  if (!flat.length) throw new EngineError("EMPTY_COURSE");
  const componentIds = new Set(flat.flatMap((r) => screenComponents(r.screen).map((c) => c.id)));
  const keep = <T>(rec: Record<string, T>) =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => componentIds.has(k)));
  const visited = saved.visited.filter((id) => byId.has(id));
  const current = byId.has(saved.currentScreenId) ? saved.currentScreenId : (visited.at(-1) ?? flat[0]!.screen.id);
  return {
    v: 1,
    courseId: course.id,
    currentScreenId: current,
    history: saved.history.filter((id) => byId.has(id)),
    visited: visited.includes(current) ? visited : [...visited, current],
    questions: keep(saved.questions),
    media: keep(saved.media),
    finished: saved.finished && byId.has(saved.currentScreenId),
  };
}

/* ───────────── Screen status ───────────── */

export function isScreenComplete(screen: Screen, state: PlayerState): boolean {
  for (const c of screenComponents(screen)) {
    if (isQuestion(c) && !state.questions[c.id]?.resolved) return false;
    if (c.type === "video" && c.requiredWatchPercent > 0 && (state.media[c.id] ?? 0) < c.requiredWatchPercent) return false;
  }
  return true;
}

export function canContinue(course: Course, state: PlayerState): boolean {
  if (state.finished) return false;
  const screen = getScreen(course, state.currentScreenId);
  return !screen.required || isScreenComplete(screen, state);
}

/* ───────────── Flow resolution ───────────── */

function ruleMatches(rule: FlowRule, screen: Screen, state: PlayerState): boolean {
  const q = state.questions[rule.when.componentId];
  if (!q?.resolved) return false;
  const o = rule.when.outcome;
  if (o === "correct") return q.correct;
  if (o === "incorrect") return !q.correct;
  if (o === "attempts_exhausted") {
    const c = findComponent(screen, rule.when.componentId);
    return !q.correct && !!c && isQuestion(c) && q.attempts >= c.maxAttempts;
  }
  const r = q.lastResponse;
  return r?.type === "choiceQuestion" && r.optionIds.includes(o.choice);
}

/** The target that "continue" would take from the current screen. */
export function resolveTarget(course: Course, state: PlayerState): FlowTarget {
  const screen = getScreen(course, state.currentScreenId);
  for (const rule of screen.flow.rules) if (ruleMatches(rule, screen, state)) return rule.then;
  return screen.flow.default;
}

function moveTo(course: Course, state: PlayerState, target: FlowTarget): PlayerState {
  if (target.kind === "end") return { ...state, finished: true };
  let nextId: string | undefined;
  if (target.kind === "goto") {
    nextId = getScreen(course, target.screenId).id;
  } else {
    const { flat, byId } = indexScreens(course);
    const cur = byId.get(state.currentScreenId)!;
    nextId = flat[cur.index + 1]?.screen.id;
    if (!nextId) return { ...state, finished: true }; // last screen → end
  }
  return {
    ...state,
    currentScreenId: nextId,
    history: [...state.history, state.currentScreenId],
    visited: state.visited.includes(nextId) ? state.visited : [...state.visited, nextId],
  };
}

/* ───────────── Step ───────────── */

export function step(course: Course, state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case "answer": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      const screen = getScreen(course, state.currentScreenId);
      const c = findComponent(screen, event.componentId);
      if (!c) throw new EngineError("UNKNOWN_COMPONENT", event.componentId);
      if (!isQuestion(c)) throw new EngineError("NOT_A_QUESTION", event.componentId);
      const prev = state.questions[c.id];
      if (prev?.resolved) throw new EngineError("QUESTION_LOCKED", c.id);
      const correct = grade(c as QuestionComponent, event.response);
      const attempts = (prev?.attempts ?? 0) + 1;
      const next: QuestionState = {
        attempts,
        correct,
        resolved: correct || attempts >= c.maxAttempts,
        lastResponse: event.response,
        earned: correct ? c.points : 0,
      };
      return { ...state, questions: { ...state.questions, [c.id]: next } };
    }

    case "media_progress": {
      const screen = getScreen(course, state.currentScreenId);
      const c = findComponent(screen, event.componentId);
      if (!c || (c.type !== "video" && c.type !== "audio")) throw new EngineError("UNKNOWN_COMPONENT", event.componentId);
      const pct = Math.max(0, Math.min(100, Math.round(event.percent)));
      if ((state.media[c.id] ?? 0) >= pct) return state;
      return { ...state, media: { ...state.media, [c.id]: pct } };
    }

    case "continue": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      if (!canContinue(course, state)) throw new EngineError("SCREEN_INCOMPLETE");
      return moveTo(course, state, resolveTarget(course, state));
    }

    case "button": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      const screen = getScreen(course, state.currentScreenId);
      const c = findComponent(screen, event.componentId);
      if (!c || c.type !== "button") throw new EngineError("UNKNOWN_COMPONENT", event.componentId);
      if (!canContinue(course, state)) throw new EngineError("SCREEN_INCOMPLETE");
      return moveTo(course, state, c.target);
    }

    case "back": {
      const prev = state.history.at(-1);
      if (!prev) throw new EngineError("NO_HISTORY");
      // Reviewing a previous screen; answers stay locked.
      return { ...state, currentScreenId: prev, history: state.history.slice(0, -1), finished: false };
    }

    case "goto": {
      getScreen(course, event.screenId);
      const allowed = course.settings.navigation === "free_after_visit" && state.visited.includes(event.screenId);
      if (!allowed) throw new EngineError("NAVIGATION_NOT_ALLOWED");
      return {
        ...state,
        currentScreenId: event.screenId,
        history: [...state.history, state.currentScreenId],
        finished: false,
      };
    }
  }
}

/* ───────────── Results ───────────── */

export interface Summary {
  /** Earned / possible across questions on visited screens (exam units only, when the course has any). null when none were seen. */
  scorePercent: number | null;
  earned: number;
  possible: number;
  visitedScreens: number;
  totalScreens: number;
  /** Rough progress for display (branching courses rarely visit every screen). */
  progressPercent: number;
  incompleteRequired: string[];
  status: "in_progress" | "passed" | "failed" | "completed";
}

export function summarize(course: Course, state: PlayerState): Summary {
  const { flat, byId } = indexScreens(course);
  let earned = 0;
  let possible = 0;
  const incompleteRequired: string[] = [];
  // When the course has exam units, practice questions in lessons do not count toward the score.
  const examOnly = course.units.some((u) => u.kind === "exam");
  for (const id of state.visited) {
    const ref = byId.get(id);
    const screen = ref?.screen;
    if (!screen) continue;
    const scored = !examOnly || ref.unit.kind === "exam";
    for (const c of screenComponents(screen)) {
      if (!isQuestion(c) || !scored) continue;
      possible += c.points;
      earned += state.questions[c.id]?.earned ?? 0;
    }
    if (screen.required && !isScreenComplete(screen, state)) incompleteRequired.push(id);
  }
  const scorePercent = possible > 0 ? Math.round((earned / possible) * 100) : null;
  const { requireAllRequiredScreens, passingScore } = course.settings.completion;

  let status: Summary["status"] = "in_progress";
  if (state.finished && (!requireAllRequiredScreens || incompleteRequired.length === 0)) {
    if (passingScore === null) status = "completed";
    else status = (scorePercent ?? 100) >= passingScore ? "passed" : "failed";
  }

  return {
    scorePercent,
    earned,
    possible,
    visitedScreens: state.visited.length,
    totalScreens: flat.length,
    progressPercent: state.finished ? 100 : Math.min(99, Math.round((state.visited.length / flat.length) * 100)),
    incompleteRequired,
    status,
  };
}
