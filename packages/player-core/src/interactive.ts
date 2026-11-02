import type { ScenePage } from "@mozes/content-schema";

export interface SceneProgress { step: number; matches: Record<string, string> }
export function sceneProgress(scene: ScenePage, saved?: SceneProgress): SceneProgress {
  const matches: Record<string, string> = {};
  for (const object of scene.objects) if (object.kind === "drop" && saved?.matches?.[object.id] === object.accept) matches[object.id] = object.accept;
  return { step: Math.max(0, Math.min(Math.max(0, scene.states.length - 1), Number.isInteger(saved?.step) ? saved!.step : 0)), matches };
}
export function sceneMatchesComplete(scene: ScenePage, progress: SceneProgress): boolean {
  return scene.objects.every(o => o.kind !== "drop" || progress.matches[o.id] === o.accept);
}
export function sceneIsComplete(scene: ScenePage, progress: SceneProgress): boolean {
  return sceneMatchesComplete(scene, progress) && progress.step >= scene.states.length - 1;
}
