"use client";

import "@mozes/player-react/player.css";
import { useState } from "react";
import type { Course } from "@mozes/content-schema";
import { CoursePlayer, type MediaResolver } from "@mozes/player-react";
import { DEMO_MEDIA } from "@/content/demo-course";

const resolveMedia: MediaResolver = (ref) => DEMO_MEDIA[ref.assetId] ?? null;

export function DemoPlayer({ course }: { course: Course }) {
  // Remounting the player restarts the preview from the first screen.
  const [run, setRun] = useState(0);
  return (
    <div className="demo-player">
      <div className="demo-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRun((r) => r + 1)}>
          התחלה מחדש
        </button>
      </div>
      <CoursePlayer key={run} course={course} resolveMedia={resolveMedia} />
    </div>
  );
}
