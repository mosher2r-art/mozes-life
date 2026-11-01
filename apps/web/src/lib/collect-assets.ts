import type { Course } from "@mozes/content-schema";

/** Every media asset id referenced anywhere in a course. */
export function collectAssetIds(course: Course): string[] {
  const ids = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.assetId === "string" && Object.keys(o).length === 1) ids.add(o.assetId);
      Object.values(o).forEach(visit);
    }
  };
  visit(course.units);
  return [...ids];
}
