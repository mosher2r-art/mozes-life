"use client";

import Link from "next/link";
import { useState } from "react";
import { PackageFrame } from "@/components/PackageFrame";

export function PackageCourseView({
  courseId,
  title,
  launchUrl,
  latestVersion,
  canPublish,
  report,
}: {
  courseId: string;
  title: string;
  launchUrl: string | null;
  latestVersion: number | null;
  canPublish: boolean;
  report: React.ReactNode;
}) {
  const [version, setVersion] = useState(latestVersion);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  async function publish() {
    setPending(true);
    setMsg(null);
    const res = await fetch(`/api/studio/courses/${courseId}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ medicalConfirmed: false }) });
    const body = (await res.json().catch(() => ({}))) as { versionNo?: number; error?: string };
    setPending(false);
    if (res.ok && body.versionNo) {
      setVersion(body.versionNo);
      setMsg({ tone: "ok", text: `הקורס פורסם (גרסה ${body.versionNo}). אפשר לשייך אליו לומדים.` });
    } else setMsg({ tone: "bad", text: body.error === "unchanged" ? "הקורס כבר מפורסם." : "הפרסום נכשל." });
  }

  return (
    <div className="page page-wide">
      <header className="page-head">
        <Link href="/studio/courses" className="ed-back">→ קורסים</Link>
        <p className="kicker">לומדה מיובאת</p>
        <h1 className="page-title">{title}</h1>
        <div className="pkg-actions">
          <span className={`chip ${version ? "chip-done" : "chip-neutral"}`}>{version ? `פורסם · גרסה ${version}` : "טיוטה"}</span>
          {canPublish && !version && (
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={publish}>{pending ? "מפרסם…" : "פרסום"}</button>
          )}
          {canPublish && version && <Link href={`/studio/courses/${courseId}/learners`} className="btn btn-quiet btn-sm">גישה ולומדים</Link>}
        </div>
        {msg && <p className={msg.tone === "ok" ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      </header>
      <div className="workbench">
        <div className="canvas">
          <div className="canvas-toolbar">
            <div className="segmented" role="group" aria-label="תצוגת מכשיר">
              {(["desktop", "mobile"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "mobile" ? "נייד" : "מחשב"}</button>
              ))}
            </div>
            <span className="ef-hint">תצוגה מקדימה. התקדמות בתצוגה זו אינה נשמרת.</span>
          </div>
          <div className={`device device-${device}`}>
            <div className="device-screen pkg-preview">
              {launchUrl ? (
                <PackageFrame className="pkg-frame" launchUrl={launchUrl} title={`תצוגה מקדימה: ${title}`} cmi={{}} learner={{ id: "preview", name: "תצוגה מקדימה" }} />
              ) : (
                <p className="ed-empty">אחסון הקבצים אינו מוגדר, ולכן אי אפשר להציג את הלומדה.</p>
              )}
            </div>
          </div>
        </div>
        <aside className="inspector">{report}</aside>
      </div>
    </div>
  );
}
