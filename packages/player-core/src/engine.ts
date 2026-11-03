import type { Screen as LegacyScreen } from "@mozes/content-schema/v1";
/** Explicit version dispatch keeps the v1 state machine frozen. */
import type { Course, CourseV2, Screen } from "@mozes/content-schema";
import * as V1 from "./engine-v1";
import * as V2 from "./engine-v2";
export { EngineError } from "./engine-v1";
export type { EngineErrorCode } from "./engine-v1";
export type { PlayerState, PlayerEvent, QuestionState, Summary, SimulationState } from "./engine-v2";
export function start(course: Course): V2.PlayerState { return course.schemaVersion === 1 ? V1.start(course) : V2.start(course); }
export function reconcile(course: Course, state: V2.PlayerState): V2.PlayerState { return course.schemaVersion === 1 ? V1.reconcile(course, state) : V2.reconcile(course, state); }
export function canContinue(course: Course, state: V2.PlayerState) { return course.schemaVersion === 1 ? V1.canContinue(course, state) : V2.canContinue(course, state); }
export function isScreenComplete(screen: Screen, state: V2.PlayerState) { return state.contentSchemaVersion === 2 ? V2.isScreenComplete(screen as CourseV2["units"][number]["screens"][number], state) : V1.isScreenComplete(screen as LegacyScreen, state); }
export function resolveTarget(course: Course, state: V2.PlayerState) { return course.schemaVersion === 1 ? V1.resolveTarget(course, state) : V2.resolveTarget(course, state); }
export function summarize(course: Course, state: V2.PlayerState) { return course.schemaVersion === 1 ? V1.summarize(course, state) : V2.summarize(course, state); }
export function step(course: Course, state: V2.PlayerState, event: V2.PlayerEvent): V2.PlayerState {
  if (course.schemaVersion === 2) return V2.step(course, state, event);
  const legacy = new Set(["scene_advance", "scene_drop", "answer", "media_progress", "continue", "button", "back", "goto"]);
  if (!legacy.has(event.type)) throw new V1.EngineError("UNKNOWN_COMPONENT", "האירוע אינו נתמך בגרסת התוכן הזאת");
  return V1.step(course, state, event as V1.PlayerEvent);
}
