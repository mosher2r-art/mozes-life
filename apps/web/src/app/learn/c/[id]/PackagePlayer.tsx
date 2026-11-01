"use client";

import { useCallback, useRef, useState } from "react";
import { PackageFrame } from "@/components/PackageFrame";

type Save = "idle" | "saving" | "saved" | "offline";

export function PackagePlayer(props: {
  enrollmentId: string;
  title: string;
  format: "scorm12" | "scorm2004" | "html5";
  launchUrl: string;
  cmi: Record<string, string>;
  learner: { id: string; name: string };
  initiallyDone: boolean;
}) {
  const [save, setSave] = useState<Save>("idle");
  const [done, setDone] = useState(props.initiallyDone);
  const latest = useRef(props.cmi);

  const send = useCallback(
    async (cmi: Record<string, string>, complete = false) => {
      latest.current = cmi;
      setSave("saving");
      try {
        const res = await fetch(`/api/learn/enrollments/${props.enrollmentId}/package`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cmi, ...(complete ? { complete: true } : {}) }),
          keepalive: true,
        });
        setSave(res.ok ? "saved" : "offline");
        if (res.ok && complete) setDone(true);
      } catch {
        setSave("offline");
      }
    },
    [props.enrollmentId],
  );

  return (
    <div className="pkg-shell">
      <div className="pkg-bar">
        <span className="pkg-title">{props.title}</span>
        {save !== "idle" && (
          <span className={`save-status save-${save === "offline" ? "offline" : save}`} role="status" aria-live="polite">
            {save === "saving" ? "שומר…" : save === "saved" ? "ההתקדמות נשמרה" : "אין חיבור — ההתקדמות לא נשמרה"}
          </span>
        )}
        {props.format === "html5" &&
          (done ? (
            <span className="chip chip-done">סומן כהושלם</span>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void send(latest.current, true)}>
              סיימתי את הלומדה
            </button>
          ))}
      </div>
      <PackageFrame className="pkg-frame" launchUrl={props.launchUrl} title={props.title} cmi={props.cmi} learner={props.learner} onCommit={(c) => void send(c)} />
    </div>
  );
}
