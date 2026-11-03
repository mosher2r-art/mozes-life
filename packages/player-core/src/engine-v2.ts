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
  type CourseV2 as Course,
  type FlowRule,
  type FlowTarget,
  type QuestionComponent,
  type ScreenV2 as Screen,


  isQuestion,

} from "@mozes/content-schema";
import { grade, type Response } from "./grading";
import { EngineError } from "./engine-v1";
const screenComponents = (screen: Screen) => Object.values(screen.slots).flat();
const findComponent = (screen: Screen, id: string) => screenComponents(screen).find(c => c.id === id);
const flattenScreens = (course: Course) => course.units.flatMap(unit => unit.screens.map(screen => ({ unit, screen }))).map((r, index) => ({ ...r, index }));
export interface SimulationState { started: boolean; nextStep: number; mistakes: number; completed: boolean; events: ({ type: "started" } | { type: "step"; action: number; correct: boolean } | { type: "completed"; score: number; mistakes: number })[] }

import { sceneProgress, sceneMatchesComplete, sceneIsComplete, type SceneProgress } from "./interactive";

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
  contentSchemaVersion?: 2;
  opened?: Record<string, string[]>;
  variables?: Record<string, boolean | number | string>;
  narration?: Record<string, number>;
  preferences?: { narrationMuted: boolean };
  simulations?: Record<string, SimulationState>;
  decisions?: { screenId: string; componentId: string; optionId: string }[];
  courseId: string;
  currentScreenId: string;
  /** Navigation stack for "back". */
  history: string[];
  /** Unique screen ids in first-visit order. */
  visited: string[];
  questions: Record<string, QuestionState>;
  /** componentId → highest percentage watched/listened. */
  media: Record<string, number>;
  /** Optional for backward compatibility with existing v1 saved progress. */
  scenes?: Record<string, SceneProgress>;
  finished: boolean;
}

export type PlayerEvent =
  | { type: "reveal_item"; componentId: string; itemId: string }
  | { type: "narration_progress"; positionMs: number }
  | { type: "narration_show_all" }
  | { type: "narration_mute"; muted: boolean }
  | { type: "simulation_start"; componentId: string }
  | { type: "simulation_step"; componentId: string; action: number }
  | { type: "simulation_reset"; componentId: string }
  | { type: "scene_advance"; componentId: string }
  | { type: "scene_drop"; componentId: string; objectId: string; targetId: string }
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
    contentSchemaVersion: 2,
    variables: { ...course.settings.variables },
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
  const components = flat.flatMap(r => screenComponents(r.screen));
  const opened = Object.fromEntries(components.flatMap(c => {
    if (c.type !== "reveal" && c.type !== "hotspotExplore") return [];
    const items = c.type === "reveal" ? c.items : c.hotspots;
    const known = (saved.opened?.[c.id] ?? []).filter((id, i, all) => all.indexOf(id) === i && items.some(item => item.id === id));
    if (c.type === "reveal" && c.mode === "sequential") {
      const prefix: string[] = []; for (const item of items) { if (!known.includes(item.id)) break; prefix.push(item.id); }
      return [[c.id, prefix]];
    }
    return [[c.id, known]];
  }));
  const variables = { ...course.settings.variables };
  for (const key of Object.keys(variables)) if (typeof saved.variables?.[key] === typeof variables[key]) variables[key] = saved.variables![key]!;
  const simulations = Object.fromEntries(components.flatMap(c => { const previous = saved.simulations?.[c.id]; return c.type === "simulation" && previous && Number.isInteger(previous.nextStep) && previous.nextStep >= 0 && previous.nextStep <= 3 && Array.isArray(previous.events) && previous.events.length <= 200 ? [[c.id, previous]] : []; }));
  return {
    v: 1, contentSchemaVersion: 2, opened, variables, simulations,
    narration: Object.fromEntries(flat.flatMap(r => r.screen.narration ? [[r.screen.id, Math.max(0, Math.min(86_400_000, saved.narration?.[r.screen.id] ?? 0))]] : [])),
    preferences: { narrationMuted: saved.preferences?.narrationMuted === true },
    decisions: (saved.decisions ?? []).filter(d => byId.has(d.screenId) && componentIds.has(d.componentId)).slice(-1000),
    courseId: course.id,
    currentScreenId: current,
    history: saved.history.filter((id) => byId.has(id)),
    visited: visited.includes(current) ? visited : [...visited, current],
    questions: keep(saved.questions),
    media: keep(saved.media),
    ...(saved.scenes ? { scenes: Object.fromEntries(flat.flatMap(r => screenComponents(r.screen)).flatMap(c => c.type === "interactiveScene" && saved.scenes?.[c.id] ? [[c.id, sceneProgress(c.scene, saved.scenes[c.id])]] : [])) } : {}),
    finished: saved.finished && byId.has(saved.currentScreenId),
  };
}

/* ───────────── Screen status ───────────── */

export function isScreenComplete(screen: Screen, state: PlayerState): boolean {
  for (const c of screenComponents(screen)) {
    if ((c.type === "reveal" || c.type === "hotspotExplore") && c.requireAll && (c.type === "reveal" ? c.items : c.hotspots).some(item => !state.opened?.[c.id]?.includes(item.id))) return false;
    if (c.type === "simulation" && c.completion.required && !state.simulations?.[c.id]?.completed) return false;
    if (c.type === "interactiveScene" && !sceneIsComplete(c.scene, sceneProgress(c.scene, state.scenes?.[c.id]))) return false;
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
  if ("variable" in rule.when) return state.variables?.[rule.when.variable] === rule.when.equals;
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
  const questions = { ...state.questions };
  const nextScreen = getScreen(course, nextId);
  if (nextScreen.template === "decision") for (const c of screenComponents(nextScreen)) if (isQuestion(c)) delete questions[c.id];
  return {
    ...state, questions,
    currentScreenId: nextId,
    history: [...state.history, state.currentScreenId],
    visited: state.visited.includes(nextId) ? state.visited : [...state.visited, nextId],
  };
}

/* ───────────── Step ───────────── */

export function step(course: Course, state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case "reveal_item": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      const c = findComponent(getScreen(course, state.currentScreenId), event.componentId);
      if (!c || (c.type !== "reveal" && c.type !== "hotspotExplore")) throw new EngineError("UNKNOWN_COMPONENT");
      const items = c.type === "reveal" ? c.items : c.hotspots, opened = state.opened?.[c.id] ?? [];
      if (!items.some(i => i.id === event.itemId)) throw new EngineError("UNKNOWN_COMPONENT");
      if (opened.includes(event.itemId)) return state;
      if (c.type === "reveal" && c.mode === "sequential" && items[opened.length]?.id !== event.itemId) throw new EngineError("NAVIGATION_NOT_ALLOWED");
      return { ...state, opened: { ...state.opened, [c.id]: [...opened, event.itemId] } };
    }
    case "narration_mute": return { ...state, preferences: { narrationMuted: event.muted } };
    case "narration_progress":
    case "narration_show_all": {
      const screen = getScreen(course, state.currentScreenId);
      if (!screen.narration) throw new EngineError("UNKNOWN_COMPONENT");
      const position = event.type === "narration_show_all" ? Math.max(0, ...screen.narration.cues.map(c => c.atMs)) : Math.max(0, Math.min(86_400_000, Math.round(event.positionMs)));
      return { ...state, narration: { ...state.narration, [screen.id]: Math.max(state.narration?.[screen.id] ?? 0, position) } };
    }
    case "simulation_start":
    case "simulation_reset":
    case "simulation_step": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      const c = findComponent(getScreen(course, state.currentScreenId), event.componentId);
      if (!c || c.type !== "simulation" || c.module !== "software-sequence") throw new EngineError("UNKNOWN_COMPONENT");
      let simulation = state.simulations?.[c.id];
      if (event.type === "simulation_reset") return { ...state, simulations: { ...state.simulations, [c.id]: { started: false, nextStep: 0, mistakes: 0, completed: false, events: [] } } };
      if (event.type === "simulation_start") {
        if (simulation?.started) return state;
        simulation = { started: true, nextStep: 0, mistakes: 0, completed: false, events: [{ type: "started" }] };
      } else {
        if (!simulation?.started || simulation.completed || !Number.isInteger(event.action) || event.action < 0 || event.action > 2 || simulation.events.length >= 199) throw new EngineError("NAVIGATION_NOT_ALLOWED");
        const correct = event.action === simulation.nextStep, nextStep = simulation.nextStep + (correct ? 1 : 0), mistakes = simulation.mistakes + (correct ? 0 : 1);
        const events: SimulationState["events"] = [...simulation.events, { type: "step", action: event.action, correct }];
        if (nextStep === 3) events.push({ type: "completed", score: Math.max(0, 100 - mistakes * 10), mistakes });
        simulation = { started: true, nextStep, mistakes, completed: nextStep === 3, events };
      }
      return { ...state, simulations: { ...state.simulations, [c.id]: simulation } };
    }
    case "scene_advance":
    case "scene_drop": {
      if (state.finished) throw new EngineError("COURSE_FINISHED");
      const c = findComponent(getScreen(course, state.currentScreenId), event.componentId);
      if (!c || c.type !== "interactiveScene") throw new EngineError("UNKNOWN_COMPONENT", event.componentId);
      const progress = sceneProgress(c.scene, state.scenes?.[c.id]);
      if (event.type === "scene_drop") {
        const target = c.scene.objects.find(o => o.id === event.targetId && o.kind === "drop");
        const dragged = c.scene.objects.find(o => o.id === event.objectId && o.kind === "drag");
        if (!target || target.kind !== "drop" || !dragged) throw new EngineError("UNKNOWN_COMPONENT");
        if (target.accept !== dragged.id) return state;
        if (progress.matches[target.id] === dragged.id) return state;
        progress.matches[target.id] = dragged.id;
        if (sceneMatchesComplete(c.scene, progress)) progress.step = Math.min(progress.step + 1, Math.max(0, c.scene.states.length - 1));
      } else {
        if (!sceneMatchesComplete(c.scene, progress)) throw new EngineError("SCREEN_INCOMPLETE");
        progress.step = Math.min(progress.step + 1, Math.max(0, c.scene.states.length - 1));
      }
      return { ...state, scenes: { ...state.scenes, [c.id]: progress } };
    }
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
      let variables = state.variables, decisions = state.decisions;
      if (screen.template === "decision" && c.type === "choiceQuestion" && event.response.type === "choiceQuestion") {
        const selectedId = event.response.optionIds[0];
        const selected = c.options.find(o => o.id === selectedId);
        if (selected?.setVariables) variables = { ...variables, ...selected.setVariables };
        if (selected) decisions = [...(decisions ?? []), { screenId: screen.id, componentId: c.id, optionId: selected.id }].slice(-1000);
      }
      return { ...state, variables, decisions, questions: { ...state.questions, [c.id]: next } };
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
