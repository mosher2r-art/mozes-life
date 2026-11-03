import type { Course, MediaRef } from "./schema";
import { captionRefs } from "./schema-v2";
export type MediaKind = "image" | "video" | "audio" | "captions" | "animation";
export interface MediaUse { screenId: string; componentId?: string; path: string; ref: MediaRef; kinds: readonly MediaKind[] }
/** Includes optional/nested assets, not only a component's primary media. */
export function mediaUses(course: Course): MediaUse[] {
  const out: MediaUse[] = [];
  for (const unit of course.units) for (const screen of unit.screens) {
    const add = (ref: MediaRef | undefined, kinds: MediaKind[], path: string, componentId?: string) => { if (ref) out.push({ screenId: screen.id, componentId, path, ref, kinds }); };
    if ("narration" in screen && screen.narration) { add(screen.narration.media, ["audio"], "narration.media"); add(screen.narration.captions, ["captions"], "narration.captions"); }
    for (const [slot, components] of Object.entries(screen.slots)) for (const c of components) {
      const path = `slots.${slot}.${c.id}`;
      if (c.type === "image" || c.type === "hotspotImage" || c.type === "hotspotExplore") add(c.media, ["image"], path + ".media", c.id);
      if (c.type === "audio") add(c.media, ["audio"], path + ".media", c.id);
      if (c.type === "animation") add(c.media, ["animation", "video"], path + ".media", c.id);
      if (c.type === "video") { add(c.media, ["video"], path + ".media", c.id); add(c.poster, ["image"], path + ".poster", c.id); for (const [i, ref] of captionRefs(c.captions).entries()) add(ref, ["captions"], path + `.captions.${i}`, c.id); }
      if (c.type === "choiceQuestion") for (const option of c.options) if ("image" in option) add(option.image, ["image"], path + `.options.${option.id}.image`, c.id);
      if (c.type === "reveal") for (const item of c.items) if (item.content.kind === "image") add(item.content.media, ["image"], path + `.items.${item.id}.content.media`, c.id);
    }
  }
  return out;
}
