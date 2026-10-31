"use client";

import { createContext, useContext } from "react";
import type { Course, MediaRef } from "@mozes/content-schema";
import type { PlayerEvent, PlayerState } from "@mozes/player-core";

export interface ResolvedMedia {
  src: string;
  mime?: string;
}

/** The host app decides where media lives (library, CDN, signed URLs). */
export type MediaResolver = (ref: MediaRef) => ResolvedMedia | null;

export interface PlayerContextValue {
  course: Course;
  state: PlayerState;
  dispatch: (event: PlayerEvent) => void;
  resolveMedia: MediaResolver;
  /** Scenario screens: whether the decision has been revealed. */
  revealed: boolean;
  reveal: () => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <CoursePlayer>");
  return ctx;
}
