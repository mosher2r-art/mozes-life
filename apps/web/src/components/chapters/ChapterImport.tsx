"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface ImportedChapterView {
  id: string;
  title: string;
  kind: "lesson" | "exam";
  missingMedia: number;
}
interface Result {
  file: string;
  ok: boolean;
  message?: string;
  chapters?: ImportedChapterView[];
}

const MAX_TOTAL = 5_000_000;

/**
 * Imports chapter files (.json) into the bank: one "mozes-chapter" per file, or a whole
 * "mozes-course" that is split into one chapter per unit. Ids are regenerated on the server.
 */
export function ChapterImport({ onImported, compact = false }: { onImported?: (chapters: ImportedChapterView[]) => void; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  async function send(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    setError(null);
    setResults(null);
    const bad = files.find((f) => !/\.json$/i.test(f.name));
    if (bad) return setError(`"${bad.name}" אינו קובץ JSON. מייבאים כאן קובצי פרקים של MOZES (‎.json).`);
    if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return setError("הקבצים גדולים מדי (עד 5MB בסך הכול).");
    if (files.length > 20) return setError("אפשר לייבא עד 20 קבצים בבת אחת.");
    setBusy(true);
    try {
      const payload = { files: await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))) };
      const res = await fetch("/api/studio/chapters/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { results?: Result[]; message?: string };
      if (!res.ok || !body.results) return setError(body.message ?? "הייבוא נכשל.");
      setResults(body.results);
      const created = body.results.flatMap((r) => r.chapters ?? []);
      if (created.length) onImported?.(created);
      if (created.length && !onImported) router.refresh();
    } catch {
      setError("אין חיבור לשרת. נסו שוב.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="cb-section">
      <div
        className={`drop${over ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files); }}
      >
        {!compact && <strong>גררו לכאן קובצי פרקים</strong>}
        <span>קובצי ‎.json של פרק, קורס או לומדה אינטראקטיבית של MOZES. סוג התוכן מזוהה אוטומטית; קורס שלם יפוצל לפרקים.</span>
        <label className="btn btn-quiet btn-sm">
          {busy ? "מייבא…" : "בחירת קבצים"}
          <input ref={input} type="file" accept=".json,application/json" multiple className="visually-hidden" aria-label="בחירת קובצי פרקים לייבוא" disabled={busy} onChange={(e) => e.target.files && void send(e.target.files)} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {results && (
        <ul className="import-results" role="status">
          {results.map((r, i) =>
            r.ok ? (
              <li key={i}>
                <strong>{r.file}</strong>: יובאו {r.chapters!.length === 1 ? "פרק אחד" : `${r.chapters!.length} פרקים`}{" "}
                ({r.chapters!.map((c, index) => <span key={c.id}>{index > 0 && ", "}<Link href={`/studio/chapters/${c.id}`} prefetch={false}>{c.title}</Link>{c.kind === "exam" ? " · מבחן" : ""}</span>)})
                {r.chapters!.some((c) => c.missingMedia > 0) && <> · שימו לב: יש קבצי מדיה שלא נמצאו בספרייה. הוסיפו אותם בעורך הפרק.</>}
              </li>
            ) : (
              <li key={i} className="is-bad"><strong>{r.file}</strong>: {r.message}</li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
