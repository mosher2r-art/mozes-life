"use client";

import "@mozes/player-react/player.css";
import { useState } from "react";
import type { Course } from "@mozes/content-schema";
import { CoursePlayer, type MediaResolver } from "@mozes/player-react";
import { DEMO_MEDIA } from "@/content/demo-course";

const resolveMedia: MediaResolver = (ref) => ref.assetId ? DEMO_MEDIA[ref.assetId] ?? null : null;

type Device = "mobile" | "desktop";

export function DemoPlayer({ course, validation }: { course: Course; validation: React.ReactNode }) {
  const [run, setRun] = useState(0); // remount = restart from the first screen
  const [device, setDevice] = useState<Device>("mobile");
  return (
    <div className="workbench">
      <div className="canvas">
        <div className="canvas-toolbar">
          <div className="segmented" role="group" aria-label="תצוגת מכשיר">
            {(["mobile", "desktop"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>
                {d === "mobile" ? "נייד" : "מחשב"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRun((r) => r + 1)}>
            התחלה מחדש
          </button>
        </div>
        <div className={`device device-${device}`}>
          <div className="device-screen">
            <CoursePlayer key={run} course={course} resolveMedia={resolveMedia} />
          </div>
        </div>
      </div>
      <aside className="inspector" aria-label="פרטי הקורס">
        {validation}
      </aside>
    </div>
  );
}
