"use client";

import "@mozes/player-react/player.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Course, type CourseInput } from "@mozes/content-schema";
import { start } from "@mozes/player-core";
import { CoursePlayer, type MediaResolver } from "@mozes/player-react";

/**
 * Full-screen preview of what a learner would see, on a phone or a computer frame.
 * Nothing is recorded: the player runs locally from the current (unsaved or unpublished) content.
 */
export function PreviewDialog({
  content,
  resolveMedia,
  fromScreenId,
  fromLabel,
  onClose,
}: {
  content: CourseInput | Course;
  resolveMedia: MediaResolver;
  /** When set, offers to start at this screen instead of the beginning. */
  fromScreenId?: string | null;
  fromLabel?: string;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [from, setFrom] = useState<"start" | "screen">(fromScreenId ? "screen" : "start");
  const [run, setRun] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsed = useMemo(() => Course.safeParse(content), [content]);
  const initial = useMemo(() => {
    if (!parsed.success || !parsed.data.units.some((u) => u.screens.length)) return null;
    const s = start(parsed.data);
    if (from === "screen" && fromScreenId && parsed.data.units.some((u) => u.screens.some((x) => x.id === fromScreenId))) {
      return { ...s, currentScreenId: fromScreenId, visited: [fromScreenId] };
    }
    return s;
  }, [parsed, from, fromScreenId]);

  return (
    <div className="pv-backdrop" role="dialog" aria-modal="true" aria-labelledby="pv-title">
      <div className="pv-bar">
        <h2 id="pv-title" className="pv-title">תצוגה מקדימה</h2>
        <div className="segmented" role="group" aria-label="תצוגת מכשיר">
          {(["mobile", "desktop"] as const).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "mobile" ? "טלפון" : "מחשב"}</button>
          ))}
        </div>
        {fromScreenId && (
          <div className="segmented" role="group" aria-label="נקודת התחלה">
            <button type="button" aria-pressed={from === "screen"} onClick={() => { setFrom("screen"); setRun((r) => r + 1); }}>{fromLabel ?? "מהמסך הנוכחי"}</button>
            <button type="button" aria-pressed={from === "start"} onClick={() => { setFrom("start"); setRun((r) => r + 1); }}>מההתחלה</button>
          </div>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRun((r) => r + 1)}>הפעלה מחדש</button>
        <span className="pv-note">תצוגה בלבד. תשובות לא נשמרות.</span>
        <button ref={closeRef} type="button" className="btn btn-primary btn-sm pv-close" onClick={onClose}>סגירה</button>
      </div>
      <div className="pv-stage">
        <div className={`device device-${device}`}>
          <div className="device-screen">
            {initial && parsed.success ? (
              <CoursePlayer key={`${run}:${device}:${from}`} course={parsed.data} resolveMedia={resolveMedia} initialState={initial} />
            ) : (
              <p className="ed-empty">{parsed.success ? "אין עדיין מסכים להצגה." : "יש שדות חובה חסרים. השלימו אותם כדי לראות תצוגה מקדימה."}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
