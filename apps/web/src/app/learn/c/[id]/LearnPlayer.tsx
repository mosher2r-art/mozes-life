"use client";

import "@mozes/player-react/player.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "@mozes/content-schema";
import type { PlayerEvent, PlayerState } from "@mozes/player-core";
import { CoursePlayer, type MediaResolver } from "@mozes/player-react";
import { DEMO_MEDIA } from "@/content/demo-course";


type Save = "idle" | "saving" | "saved" | "offline" | "error";
const SAVE_TEXT: Record<Save, string> = {
  idle: "",
  saving: "שומר…",
  saved: "ההתקדמות נשמרה",
  offline: "אין חיבור — ננסה לשמור שוב",
  error: "השמירה נכשלה",
};

export function LearnPlayer({
  enrollmentId,
  course,
  initialState,
  media,
}: {
  enrollmentId: string;
  course: Course;
  initialState: PlayerState;
  media: Record<string, { src: string; mime: string }>;
}) {
  // Library files first; the built-in demo assets remain available for the demo course.
  const resolveMedia: MediaResolver = useCallback((ref) => media[ref.assetId] ?? DEMO_MEDIA[ref.assetId] ?? null, [media]);
  const [save, setSave] = useState<Save>("idle");
  const [resync, setResync] = useState<{ key: number; state: PlayerState }>({ key: 0, state: initialState });
  const queue = useRef<PlayerEvent[]>([]);
  const inflight = useRef(false);
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    if (inflight.current || queue.current.length === 0) return;
    inflight.current = true;
    const batch = queue.current.slice(0, 50);
    setSave("saving");
    try {
      const res = await fetch(`/api/learn/enrollments/${enrollmentId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
      if (res.ok) {
        queue.current = queue.current.slice(batch.length);
        retry.current = 0;
        setSave(queue.current.length ? "saving" : "saved");
      } else if (res.status === 409) {
        // The server is the source of truth: adopt its state and drop the rest of the queue.
        const body = (await res.json()) as { state: PlayerState };
        queue.current = [];
        setResync((r) => ({ key: r.key + 1, state: body.state }));
        setSave("saved");
      } else {
        queue.current = [];
        setSave("error");
      }
    } catch {
      setSave("offline");
      retry.current = Math.min(retry.current + 1, 5);
      timer.current = setTimeout(() => {
        inflight.current = false;
        void flush();
      }, 1000 * 2 ** retry.current);
      return;
    }
    inflight.current = false;
    if (queue.current.length) void flush();
  }, [enrollmentId]);

  const onEvent = useCallback(
    (event: PlayerEvent) => {
      queue.current.push(event);
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <CoursePlayer
      key={resync.key}
      course={course}
      resolveMedia={resolveMedia}
      initialState={resync.state}
      onEvent={onEvent}
      status={
        save === "idle" ? null : (
          <span className={`save-status save-${save}`} role="status" aria-live="polite">
            {SAVE_TEXT[save]}
          </span>
        )
      }
    />
  );
}
