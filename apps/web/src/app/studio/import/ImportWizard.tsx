"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PackageFrame } from "@/components/PackageFrame";
import { formatBytes } from "@/lib/media-policy";

interface ReportItem { severity: "error" | "warning" | "info"; code: string; message: string }
interface Report {
  verdict: "play_only" | "partial" | "unsupported";
  format: "scorm12" | "scorm2004" | "html5" | null;
  title: string;
  launchPath: string | null;
  fileCount: number;
  totalBytes: number;
  tracking: string;
  items: ReportItem[];
}
interface ImportView { id: string; filename: string; status: string; report: Report | null; launchUrl: string | null }

const STEPS = ["העלאה", "בדיקת תאימות", "תצוגה מקדימה", "הגדרות וקליטה"];
const VERDICT = { play_only: "נתמך להפעלה בלבד", partial: "נתמך חלקית", unsupported: "אינו נתמך" } as const;
const FORMAT = { scorm12: "SCORM 1.2", scorm2004: "SCORM 2004", html5: "HTML5" } as const;
const SEV = { error: "שגיאה", warning: "אזהרה", info: "מידע" } as const;

export function ImportWizard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportView | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  async function upload(file: File) {
    setError(null);
    if (!/\.zip$/i.test(file.name)) return setError("יש לבחור קובץ ZIP של הלומדה.");
    const res = await fetch("/api/studio/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size }) });
    const r = (await res.json().catch(() => ({}))) as { id?: string; upload?: { url: string; method: string; headers: Record<string, string> }; message?: string };
    if (!res.ok || !r.id || !r.upload) return setError(r.message ?? "ההעלאה נכשלה.");
    setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(r.upload!.method, r.upload!.url);
        for (const [k, v] of Object.entries(r.upload!.headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("שליחת הקובץ נכשלה.")));
        xhr.onerror = () => reject(new Error("אין חיבור. נסו שוב."));
        xhr.send(file);
      });
    } catch (e) {
      setProgress(null);
      return setError(e instanceof Error ? e.message : "ההעלאה נכשלה.");
    }
    setProgress(null);
    setChecking(true);
    setStep(1);
    const a = await fetch(`/api/studio/import/${r.id}/analyse`, { method: "POST" });
    setChecking(false);
    const view = (await a.json().catch(() => null)) as ImportView | null;
    if (!a.ok || !view) return setError("בדיקת החבילה נכשלה.");
    setJob(view);
    setTitle(view.report?.title || file.name.replace(/\.zip$/i, ""));
  }

  async function createCourse() {
    if (!job) return;
    setCreating(true);
    setError(null);
    const res = await fetch(`/api/studio/import/${job.id}/course`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    const r = (await res.json().catch(() => ({}))) as { courseId?: string; message?: string };
    if (res.ok && r.courseId) router.push(`/studio/courses/${r.courseId}`);
    else {
      setCreating(false);
      setError(r.message ?? "יצירת הקורס נכשלה.");
    }
  }

  const report = job?.report;
  const usable = report && report.verdict !== "unsupported" && job?.launchUrl;

  return (
    <div className="wizard">
      <ol className="steps" aria-label="שלבי הייבוא">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {error && <p className="form-error" role="alert">{error}</p>}

      {step === 0 && (
        <div
          className={`dropzone${drag ? " is-drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
        >
          <p className="dropzone-title">גררו לכאן את קובץ ה-ZIP של הלומדה, או</p>
          <button type="button" className="btn btn-dark btn-sm" disabled={progress !== null} onClick={() => input.current?.click()}>בחירת קובץ</button>
          <p className="muted dropzone-hint">SCORM 1.2 · SCORM 2004 · HTML5 · עד 500MB</p>
          <input ref={input} type="file" hidden accept=".zip,application/zip" aria-label="בחירת קובץ ZIP לייבוא" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          {progress !== null && (
            <div className="uploads-bar wide" role="progressbar" aria-label="העלאת הלומדה" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="stack-sm">
          {checking && <p className="block" role="status">בודקים את החבילה: מבנה, קבצים, אבטחה ותאימות…</p>}
          {report && (
            <section className="block report" aria-labelledby="w-report">
              <div className="report-head">
                <h2 id="w-report">דוח תאימות</h2>
                <span className={`chip ${report.verdict === "play_only" ? "chip-done" : report.verdict === "partial" ? "chip-progress" : "chip-fail"}`}>{VERDICT[report.verdict]}</span>
              </div>
              <dl className="report-facts">
                <div><dt>סוג</dt><dd>{report.format ? FORMAT[report.format] : "לא זוהה"}</dd></div>
                <div><dt>שם בחבילה</dt><dd>{report.title || "—"}</dd></div>
                <div><dt>קבצים</dt><dd className="num">{report.fileCount}</dd></div>
                <div><dt>גודל</dt><dd className="num">{formatBytes(report.totalBytes)}</dd></div>
                {report.tracking && <div className="report-wide"><dt>מעקב</dt><dd>{report.tracking}</dd></div>}
              </dl>
              <ul className="issues">
                {report.items.map((i, n) => (
                  <li key={n} className={`issue issue-${i.severity}`}><span className="issue-sev">{SEV[i.severity]}</span><span>{i.message}</span></li>
                ))}
              </ul>
              <div className="ed-modal-actions">
                {usable ? (
                  <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>המשך לתצוגה מקדימה</button>
                ) : (
                  <button type="button" className="btn btn-quiet" onClick={() => { setJob(null); setStep(0); }}>ייבוא קובץ אחר</button>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {step === 2 && usable && (
        <div className="stack-sm">
          <div className="canvas">
            <div className="canvas-toolbar">
              <div className="segmented" role="group" aria-label="תצוגת מכשיר">
                {(["desktop", "mobile"] as const).map((d) => (
                  <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "mobile" ? "נייד" : "מחשב"}</button>
                ))}
              </div>
              <span className="ef-hint">בדקו שהלומדה נטענת ושהאינטראקציות עובדות. התקדמות כאן אינה נשמרת.</span>
            </div>
            <div className={`device device-${device}`}>
              <div className="device-screen pkg-preview">
                <PackageFrame className="pkg-frame" launchUrl={job!.launchUrl!} title="תצוגה מקדימה של הלומדה" cmi={{}} learner={{ id: "preview", name: "תצוגה מקדימה" }} />
              </div>
            </div>
          </div>
          <div className="ed-modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>המשך להגדרות</button>
            <button type="button" className="btn btn-quiet" onClick={() => setStep(1)}>חזרה לדוח</button>
          </div>
        </div>
      )}

      {step === 3 && usable && (
        <form className="block new-course" onSubmit={(e) => { e.preventDefault(); void createCourse(); }}>
          <div className="field">
            <label htmlFor="import-title">שם הקורס</label>
            <input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={160} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={creating || title.trim().length < 2}>{creating ? "יוצר…" : "יצירת קורס כטיוטה"}</button>
          <p className="muted report-wide">הקורס נשמר כטיוטה. הלומדים יראו אותו רק אחרי שתפרסמו אותו במסך הקורס.</p>
        </form>
      )}
    </div>
  );
}
