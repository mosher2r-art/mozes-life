import type { Component, Course, Screen, Unit } from "./schema-v1";

export interface ScreenRef {
  unit: Unit;
  screen: Screen;
  /** 0-based position in the flattened course order. */
  index: number;
}

/** Screens in authoring order (unit by unit). */
export function flattenScreens(course: Course): ScreenRef[] {
  const out: ScreenRef[] = [];
  for (const unit of course.units) for (const screen of unit.screens) out.push({ unit, screen, index: out.length });
  return out;
}

export function screenComponents(screen: Screen): Component[] {
  return Object.values(screen.slots).flat();
}

export function findComponent(screen: Screen, id: string): Component | undefined {
  return screenComponents(screen).find((c) => c.id === id);
}
