"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CourseInput, flattenScreens } from "@mozes/content-schema";
import type { MediaResolver } from "@mozes/player-react";
import { TECHNICAL_ONLY_NOTICE, validateCourse } from "@mozes/validator";
import { ChapterImport } from "@/components/chapters/ChapterImport";
import { NewChapterForm } from "@/components/chapters/NewChapterForm";
import { PreviewDialog } from "@/components/editor/PreviewDialog";
import { DEMO_MEDIA } from "@/content/demo-course";

export interface BuilderChapterView {
  id: string;
  title: string;
  kind: "lesson" | "exam";
  screens: number;
  questions: number;
  medicalScreens: number;
}
export interface BankChapterView {
  id: string;
  title: string;
  kind: "lesson" | "exam";
  screens: number;
  questions: number;
}

export interface CourseBuilderProps {
  courseId: string;
  title: string;
  isDemo: boolean;
  revision: number;
  certificateEnabled: boolean;
  passingScore: number | null;
  chapters: BuilderChapterView[];
  missing: number;
  composed: CourseInput;
  latestVersion: number | null;
  unpublishedChanges: boolean;
  bank: BankChapterView[];
  media: Record<string, { src: string; mime?: string }>;
  canEdit: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canAssign: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; text: string };
const DEFAULT_PASSING = 80;

export function CourseBuilder(p: CourseBuilderProps) {
  const router = useRouter();
  const [revision, setRevision] = useState(p.revision);
  const [title, setTitle] = useState(p.title);
  const [chapters, setChapters] = useState(p.chapters);
  const [certificate, setCertificate] = useState(p.certificateEnabled);
  const [passing, setPassing] = useState<number | null>(p.passingScore);
  const [passingText, setPassingText] = useState(p.passingScore?.toString() ?? "");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Server data is the source of truth after every confirmed save (router.refresh()).
  useEffect(() => {
    setRevision(p.revision);
    setChapters(p.chapters);
    setCertificate(p.certificateEnabled);
    setPassing(p.passingScore);
    setPassingText(p.passingScore?.toString() ?? "");
  }, [p.revision, p.chapters, p.certificateEnabled, p.passingScore]);

  const update = useCallback(
    async (patch: { title?: string; chapterIds?: string[]; certificateEnabled?: boolean; passingScore?: number | null }) => {
      setSave({ kind: "saving" });
      const res = await fetch(`/api/studio/courses/${p.courseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision: revision, ...patch }),
      }).catch(() => null);
      if (!res) return setSave({ kind: "error", text: "אין חיבור לשרת. השינוי לא נשמר." }), false;
      const body = (await res.json().catch(() => ({}))) as { revision?: number; message?: string };
      if (res.ok && body.revision) {
        setRevision(body.revision);
        setSave({ kind: "saved" });
        router.refresh();
        return true;
      }
      setSave({ kind: "error", text: res.status === 409 ? "הקורס עודכן במקום אחר. רעננו את הדף." : (body.message ?? "השינוי לא נשמר.") });
      return false;
    },
    [p.courseId, revision, router],
  );

  const ro = !p.canEdit;
  const hasExam = chapters.some((c) => c.kind === "exam");
  const ids = chapters.map((c) => c.id);

  async function setOrder(next: BuilderChapterView[]) {
    const prev = chapters;
    setChapters(next);
    const patch: Parameters<typeof update>[0] = { chapterIds: next.map((c) => c.id) };
    if (next.some((c) => c.kind === "exam") && passing === null) patch.passingScore = DEFAULT_PASSING;
    if (!(await update(patch))) setChapters(prev);
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...chapters];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    void setOrder(next);
  };
  const addChapters = (list: BankChapterView[]) => {
    const fresh = list.filter((c) => !ids.includes(c.id)).map((c) => ({ ...c, medicalScreens: 0 }));
    if (fresh.length) void setOrder([...chapters, ...fresh]);
    setAdding(false);
  };

  /* ───────── validation & publish ───────── */
  const validation = useMemo(() => validateCourse(p.composed), [p.composed]);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const blocking = [
    ...(chapters.length === 0 ? ["אין פרקים בקורס. הוסיפו לפחות פרק אחד."] : []),
    ...(p.missing ? ["אחד הפרקים בקורס נמחק מהמאגר."] : []),
    ...(certificate && hasExam && passing === null ? ["בקורס עם מבחן ותעודה יש לקבוע ציון עובר."] : []),
    ...errors.map((e) => e.message),
  ];
  const medicalScreens = useMemo(() => {
    try {
      return flattenScreens(validation.course ?? { units: [] } as never).filter((r) => r.screen.medical.relevant).length;
    } catch {
      return 0;
    }
  }, [validation]);
  const [medicalOk, setMedicalOk] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function publish() {
    setPublishing(true);
    setPublishMsg(null);
    const res = await fetch(`/api/studio/courses/${p.courseId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medicalConfirmed: medicalOk }),
    }).catch(() => null);
    setPublishing(false);
    const body = (await res?.json().catch(() => ({}))) as { versionNo?: number; error?: string; errors?: string[] } | undefined;
    if (res?.ok && body?.versionNo) {
      setPublishOpen(false);
      setPublishMsg({ tone: "ok", text: `גרסה ${body.versionNo} פורסמה. לומדים שכבר התחילו ממשיכים בגרסה שבה התחילו.` });
      router.refresh();
    } else if (body?.error === "unchanged") setPublishMsg({ tone: "bad", text: "אין שינויים מאז הגרסה האחרונה שפורסמה." });
    else if (body?.error === "medical_unconfirmed") setPublishMsg({ tone: "bad", text: "יש לאשר שהתוכן הרפואי נבדק לפני הפרסום." });
    else setPublishMsg({ tone: "bad", text: body?.errors?.[0] ?? "הפרסום נכשל." });
  }

  const resolveMedia: MediaResolver = useCallback((ref) => p.media[ref.assetId] ?? DEMO_MEDIA[ref.assetId] ?? null, [p.media]);
  const status = p.latestVersion ? (p.unpublishedChanges ? `פורסם (גרסה ${p.latestVersion}) · יש שינויים שלא פורסמו` : `פורסם · גרסה ${p.latestVersion}`) : "טיוטה";

  return (
    <div className="cb">
      <Link href="/studio/courses" className="ed-back">→ כל הקורסים</Link>
      <header className="cb-head">
        <input
          className="cb-title"
          aria-label="שם הקורס"
          value={title}
          disabled={ro}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== p.title && title.trim().length >= 2 && void update({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className={`chip ${p.latestVersion ? (p.unpublishedChanges ? "chip-progress" : "chip-done") : "chip-neutral"}`}>{status}</span>
        {p.isDemo && <span className="chip chip-neutral">הדגמה</span>}
        <span className={`ed-save ed-save-${save.kind === "error" ? "invalid" : save.kind === "saving" ? "saving" : "saved"}`} role="status" aria-live="polite">
          {save.kind === "saving" ? "שומר…" : save.kind === "saved" ? "נשמר" : save.kind === "error" ? save.text : ""}
        </span>
        <div className="cb-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPreview(true)} disabled={chapters.length === 0}>תצוגה מקדימה</button>
          {p.canPublish && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPublishOpen(true); setPublishMsg(null); }}>פרסום</button>}
        </div>
      </header>
      {publishMsg && !publishOpen && <p className={`ed-banner ed-banner-${publishMsg.tone}`} role="status">{publishMsg.text}</p>}

      <div className="cb-grid">
        <section className="cb-section" aria-labelledby="cb-ch">
          <div className="cb-section-head">
            <h2 id="cb-ch">פרקי הקורס</h2>
            {!ro && <button type="button" className="btn btn-dark btn-sm" onClick={() => setAdding(true)}>+ הוספת פרק</button>}
          </div>
          {chapters.length === 0 ? (
            <div className="cb-empty">
              <p>הקורס עדיין ריק. משבצים בו פרקים (שיעורים ומבחנים) ממאגר הפרקים, יוצרים פרק חדש, או מייבאים פרק מקובץ.</p>
              {!ro && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>+ הוספת פרק</button>}
            </div>
          ) : (
            <ol className="cb-chapters">
              {chapters.map((c, i) => (
                <li key={c.id} className={`cb-chapter${c.kind === "exam" ? " is-exam" : ""}`}>
                  <span className="cb-chapter-n" aria-hidden="true">{i + 1}</span>
                  <span className="cb-chapter-text">
                    <Link className="cb-chapter-title" href={`/studio/chapters/${c.id}`}>{c.title}</Link>
                    <span className="cb-chapter-meta">
                      <span className={`chip ${c.kind === "exam" ? "chip-exam" : "chip-neutral"}`}>{c.kind === "exam" ? "מבחן" : "שיעור"}</span>
                      {c.screens} מסכים · {c.questions} שאלות{c.medicalScreens ? ` · ${c.medicalScreens} מסכים רפואיים` : ""}
                    </span>
                  </span>
                  <span className="cb-chapter-actions">
                    <Link className="btn btn-quiet btn-sm" href={`/studio/chapters/${c.id}`}>עריכה</Link>
                    {!ro && (
                      <>
                        <button type="button" className="ed-icon" aria-label={`הזזת ${c.title} למעלה`} disabled={i === 0 || save.kind === "saving"} onClick={() => move(i, -1)}>▲</button>
                        <button type="button" className="ed-icon" aria-label={`הזזת ${c.title} למטה`} disabled={i === chapters.length - 1 || save.kind === "saving"} onClick={() => move(i, 1)}>▼</button>
                        <button type="button" className="ed-icon" aria-label={`הסרת ${c.title} מהקורס`} title="הסרה מהקורס (הפרק נשאר במאגר)" disabled={save.kind === "saving"} onClick={() => void setOrder(chapters.filter((x) => x.id !== c.id))}>✕</button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {chapters.length > 0 && <p className="ef-hint">הסרת פרק מהקורס לא מוחקת אותו מהמאגר. כדי לשנות תוכן של פרק לוחצים על &quot;עריכה&quot;.</p>}
        </section>

        <aside className="cb-side">
          <section className="cb-card" aria-labelledby="cb-cert">
            <h2 id="cb-cert">תעודה וציון</h2>
            <label className="ef-check">
              <input type="checkbox" checked={certificate} disabled={ro || save.kind === "saving"} onChange={(e) => {
                const on = e.target.checked;
                setCertificate(on);
                void update({ certificateEnabled: on, ...(on && hasExam && passing === null ? { passingScore: DEFAULT_PASSING } : {}) });
              }} />
              הקורס מעניק תעודה
            </label>
            {hasExam ? (
              <div className="field">
                <label htmlFor="cb-pass">ציון עובר במבחנים (%)</label>
                <input
                  id="cb-pass"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={passingText}
                  disabled={ro}
                  onChange={(e) => setPassingText(e.target.value)}
                  onBlur={() => {
                    const n = passingText.trim() === "" ? null : Number(passingText);
                    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100)) return setSave({ kind: "error", text: "ציון עובר: מספר שלם בין 1 ל-100." });
                    if (n !== passing) { setPassing(n); void update({ passingScore: n }); }
                  }}
                />
                <p className="ef-hint">רק שאלות בפרקי מבחן נספרות בציון. שאלות בשיעורים הן תרגול.</p>
              </div>
            ) : (
              <p className="ef-hint">אין בקורס פרק מבחן, לכן {certificate ? "התעודה תינתן בסיום כל המסכים הנדרשים." : "הקורס מסתיים בהשלמת המסכים."}</p>
            )}
            {certificate && (
              <div className="cert-preview" aria-label="מה יופיע על התעודה">
                <span className="muted">על התעודה יופיע:</span>
                <span>שם הלומד/ת</span>
                <strong>{title || "שם הקורס"}</strong>
                <span className="muted">{hasExam && passing !== null ? `ציון (עובר מ-${passing}) · ` : ""}תאריך · קוד אימות</span>
              </div>
            )}
            {p.isDemo && <p className="ef-hint">קורס הדגמה לא מנפיק תעודות.</p>}
          </section>

          <section className="cb-card" aria-labelledby="cb-pub">
            <h2 id="cb-pub">מצב הקורס</h2>
            <p className="muted">{p.latestVersion ? `גרסה ${p.latestVersion} פורסמה.` : "הקורס עוד לא פורסם."} {p.unpublishedChanges ? "יש שינויים בפרקים או במבנה שעוד לא פורסמו." : ""}</p>
            {blocking.length > 0 ? (
              <p className="validity is-bad">{blocking.length} דברים לתקן לפני פרסום</p>
            ) : (
              <p className="validity is-ok">מוכן לפרסום</p>
            )}
            {p.canAssign && p.latestVersion && <Link className="btn btn-quiet btn-sm" href={`/studio/courses/${p.courseId}/learners`}>גישה ולומדים</Link>}
          </section>
        </aside>
      </div>

      {adding && (
        <AddChapterDialog
          bank={p.bank.filter((b) => !ids.includes(b.id))}
          canCreate={p.canCreate}
          onAdd={addChapters}
          onClose={() => setAdding(false)}
        />
      )}

      {publishOpen && (
        <div className="ed-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setPublishOpen(false)}>
          <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="pub-title">
            <h2 id="pub-title">פרסום גרסה {(p.latestVersion ?? 0) + 1}</h2>
            <p className="muted">הפרסום מצלם את הפרקים כפי שהם עכשיו. זה מה שהלומדים יראו. לומדים שכבר התחילו ממשיכים בגרסה שבה התחילו.</p>
            {blocking.length > 0 ? (
              <>
                <p className="validity is-bad">יש {blocking.length} שגיאות שחוסמות פרסום</p>
                <ul className="issues">{blocking.slice(0, 8).map((m, n) => <li key={n} className="issue issue-error"><span className="issue-sev">שגיאה</span><span>{m}</span></li>)}</ul>
              </>
            ) : (
              <p className="validity is-ok">בדיקת התקינות עברה</p>
            )}
            <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
            {medicalScreens > 0 && (
              <label className="ef-check ed-medical">
                <input type="checkbox" checked={medicalOk} onChange={(e) => setMedicalOk(e.target.checked)} />
                אני מאשר/ת ש-{medicalScreens} המסכים המסומנים כתוכן רפואי נבדקו ואושרו על ידי גורם מקצועי מוסמך. האישור נרשם ביומן המערכת.
              </label>
            )}
            {publishMsg && <p className={`ed-banner ed-banner-${publishMsg.tone}`} role="alert">{publishMsg.text}</p>}
            <div className="ed-modal-actions">
              <button type="button" className="btn btn-primary" disabled={publishing || blocking.length > 0 || (medicalScreens > 0 && !medicalOk)} onClick={publish}>
                {publishing ? "מפרסם…" : "פרסום"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setPublishOpen(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {preview && <PreviewDialog content={p.composed} resolveMedia={resolveMedia} onClose={() => setPreview(false)} />}
    </div>
  );
}

function AddChapterDialog({ bank, canCreate, onAdd, onClose }: { bank: BankChapterView[]; canCreate: boolean; onAdd: (c: BankChapterView[]) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"bank" | "new" | "import">("bank");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "lesson" | "exam">("all");
  const [chosen, setChosen] = useState<string[]>([]);
  const shown = bank.filter((b) => (kind === "all" || b.kind === kind) && b.title.includes(q.trim()));

  return (
    <div className="ed-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ed-modal ed-modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-ch-title">
        <h2 id="add-ch-title">הוספת פרק לקורס</h2>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "bank"} onClick={() => setTab("bank")}>מהמאגר</button>
          {canCreate && <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")}>פרק חדש</button>}
          {canCreate && <button type="button" role="tab" aria-selected={tab === "import"} onClick={() => setTab("import")}>ייבוא מקובץ</button>}
        </div>

        {tab === "bank" && (
          <>
            <div className="pick-tools">
              <input type="search" aria-label="חיפוש פרק" placeholder="חיפוש לפי שם" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="segmented" role="group" aria-label="סינון לפי סוג">
                {(["all", "lesson", "exam"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "all" ? "הכול" : k === "lesson" ? "שיעורים" : "מבחנים"}</button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="muted">{bank.length === 0 ? "כל הפרקים במאגר כבר בקורס, או שהמאגר ריק. צרו פרק חדש או ייבאו מקובץ." : "לא נמצאו פרקים מתאימים."}</p>
            ) : (
              <ul className="pick-list">
                {shown.map((b) => (
                  <li key={b.id}>
                    <label>
                      <input type="checkbox" checked={chosen.includes(b.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, b.id] : c.filter((x) => x !== b.id)))} />
                      <span>
                        <strong>{b.title}</strong>
                        <span className="muted"> · {b.screens} מסכים · {b.questions} שאלות</span>
                      </span>
                      <span className={`chip ${b.kind === "exam" ? "chip-exam" : "chip-neutral"}`}>{b.kind === "exam" ? "מבחן" : "שיעור"}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="ed-modal-actions">
              <button type="button" className="btn btn-primary" disabled={!chosen.length} onClick={() => onAdd(bank.filter((b) => chosen.includes(b.id)).sort((a, b) => chosen.indexOf(a.id) - chosen.indexOf(b.id)))}>
                {chosen.length > 1 ? `הוספת ${chosen.length} פרקים` : "הוספה לקורס"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={onClose}>ביטול</button>
            </div>
          </>
        )}
        {tab === "new" && (
          <>
            <p className="muted">הפרק ייווצר במאגר ויתווסף לסוף הקורס. אחר כך לוחצים עליו כדי לבנות את המסכים.</p>
            <NewChapterForm idPrefix="cb-new" onCreated={(c) => onAdd([{ ...c, screens: 1, questions: 0 }])} />
          </>
        )}
        {tab === "import" && (
          <>
            <p className="muted">הפרקים שבקובץ יישמרו במאגר ויתווספו לסוף הקורס.</p>
            <ChapterImport compact onImported={(list) => onAdd(list.map((c) => ({ id: c.id, title: c.title, kind: c.kind, screens: 0, questions: 0 })))} />
          </>
        )}
      </div>
    </div>
  );
}
