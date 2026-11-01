"use client";

import "@mozes/player-react/player.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Component, Course, type ComponentType, type FlowTarget, TEMPLATES, flattenScreens } from "@mozes/content-schema";
import { start } from "@mozes/player-core";
import { CoursePlayer, type MediaResolver } from "@mozes/player-react";
import { TECHNICAL_ONLY_NOTICE, validateCourse } from "@mozes/validator";
import { DEMO_MEDIA } from "@/content/demo-course";
import { ComponentForm, Field, TargetSelect } from "./ComponentForm";
import * as ops from "./ops";

const resolveMedia: MediaResolver = (ref) => DEMO_MEDIA[ref.assetId] ?? null;

type Save = "saved" | "dirty" | "saving" | "offline" | "conflict" | "invalid";
const SAVE_TEXT: Record<Save, string> = {
  saved: "כל השינויים נשמרו",
  dirty: "יש שינויים שלא נשמרו",
  saving: "שומר…",
  offline: "אין חיבור — ננסה לשמור שוב",
  conflict: "הקורס נשמר במקום אחר. רעננו את הדף כדי להמשיך",
  invalid: "לא נשמר",
};

export interface EditorProps {
  courseId: string;
  initial: Course;
  revision: number;
  published: boolean;
  latestVersion: number | null;
  unpublishedChanges: boolean;
  canEdit: boolean;
  canPublish: boolean;
}

export function Editor(props: EditorProps) {
  const { courseId, canEdit, canPublish } = props;
  const [doc, setDoc] = useState<Course>(props.initial);
  const [epoch, setEpoch] = useState(0); // bumps on undo/redo so uncontrolled fields remount
  const past = useRef<Course[]>([]);
  const future = useRef<Course[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);

  const firstScreen = flattenScreens(props.initial)[0]?.screen.id ?? null;
  const [screenId, setScreenId] = useState<string | null>(firstScreen);
  const [openComp, setOpenComp] = useState<string | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [panel, setPanel] = useState<"screen" | "issues">("screen");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  /* ───────── history ───────── */
  const commit = useCallback((next: Course, key?: string) => {
    const now = Date.now();
    const coalesce = key && lastKey.current?.key === key && now - lastKey.current.at < 1500;
    if (!coalesce) {
      past.current.push(doc);
      if (past.current.length > 200) past.current.shift();
    }
    future.current = [];
    lastKey.current = key ? { key, at: now } : null;
    setDoc(next);
  }, [doc]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(doc);
    lastKey.current = null;
    setDoc(prev);
    setEpoch((e) => e + 1);
  }, [doc]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(doc);
    lastKey.current = null;
    setDoc(next);
    setEpoch((e) => e + 1);
  }, [doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !canEdit) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canEdit]);

  /* ───────── autosave (status "saved" only after the server confirms) ───────── */
  const [save, setSave] = useState<Save>("saved");
  const [saveMsg, setSaveMsg] = useState("");
  const revision = useRef(props.revision);
  const savedDoc = useRef<Course>(props.initial);
  const inflight = useRef(false);
  const retry = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [unpublished, setUnpublished] = useState(props.unpublishedChanges);

  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) return false;
    const sending = docRef.current;
    if (sending === savedDoc.current) return true;
    inflight.current = true;
    setSave("saving");
    try {
      const res = await fetch(`/api/studio/courses/${courseId}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: sending, baseRevision: revision.current }),
      });
      inflight.current = false;
      if (res.ok) {
        revision.current = ((await res.json()) as { revision: number }).revision;
        savedDoc.current = sending;
        retry.current = 0;
        setUnpublished(true);
        if (docRef.current === sending) { setSave("saved"); return true; }
        return flush();
      }
      if (res.status === 409) { setSave("conflict"); return false; }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setSaveMsg(body.message ?? "");
      setSave("invalid");
      return false;
    } catch {
      inflight.current = false;
      setSave("offline");
      retry.current = Math.min(retry.current + 1, 5);
      setTimeout(() => void flush(), 1000 * 2 ** retry.current);
      return false;
    }
  }, [courseId]);

  useEffect(() => {
    if (save === "conflict") return;
    if (doc === savedDoc.current) {
      // e.g. undo followed by redo: back to exactly what the server already has.
      if (!inflight.current && save !== "saved") setSave("saved");
      return;
    }
    setSave((s) => (s === "saving" ? s : "dirty"));
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [doc, flush, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (docRef.current !== savedDoc.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* ───────── derived ───────── */
  const validation = useMemo(() => validateCourse(doc), [doc]);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const issuesByScreen = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of validation.issues) if (i.screenId && i.severity !== "info") m.set(i.screenId, (m.get(i.screenId) ?? 0) + 1);
    return m;
  }, [validation]);
  const selected = screenId ? ops.findScreen(doc, screenId)?.screen ?? null : null;
  const parsed = useMemo(() => Course.safeParse(doc), [doc]);

  const previewState = useMemo(() => {
    if (!parsed.success || !selected) return null;
    const s = start(parsed.data);
    return { ...s, currentScreenId: selected.id, visited: [selected.id] };
  }, [parsed, selected]);

  /* ───────── publish ───────── */
  const [publishOpen, setPublishOpen] = useState(false);
  const [medicalOk, setMedicalOk] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [latestVersion, setLatestVersion] = useState(props.latestVersion);
  const medicalScreens = flattenScreens(doc).filter((r) => r.screen.medical.relevant);

  async function publish() {
    setPublishing(true);
    setPublishMsg(null);
    const saved = await flush();
    if (!saved && docRef.current !== savedDoc.current) {
      setPublishing(false);
      setPublishMsg({ tone: "bad", text: "יש לשמור את השינויים לפני הפרסום. בדקו את סטטוס השמירה." });
      return;
    }
    const res = await fetch(`/api/studio/courses/${courseId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medicalConfirmed: medicalOk }),
    });
    setPublishing(false);
    const body = (await res.json().catch(() => ({}))) as { versionNo?: number; error?: string; errors?: string[] };
    if (res.ok && body.versionNo) {
      setLatestVersion(body.versionNo);
      setUnpublished(false);
      setPublishOpen(false);
      setPublishMsg({ tone: "ok", text: `גרסה ${body.versionNo} פורסמה. לומדים שכבר התחילו ממשיכים בגרסה שבה התחילו.` });
    } else if (body.error === "unchanged") {
      setPublishMsg({ tone: "bad", text: "אין שינויים מאז הגרסה האחרונה שפורסמה." });
    } else if (body.error === "medical_unconfirmed") {
      setPublishMsg({ tone: "bad", text: "יש לאשר שהתוכן הרפואי נבדק לפני הפרסום." });
    } else {
      setPublishMsg({ tone: "bad", text: body.errors?.[0] ?? "הפרסום נכשל." });
    }
  }

  /* ───────── helpers ───────── */
  const ro = !canEdit;
  const patchScreen = (fn: Parameters<typeof ops.updateScreen>[2], key: string) => selected && commit(ops.updateScreen(doc, selected.id, fn), key);
  const statusLabel = latestVersion ? (unpublished ? `פורסם (גרסה ${latestVersion}) · יש שינויים שלא פורסמו` : `פורסם · גרסה ${latestVersion}`) : "טיוטה";

  return (
    <div className="ed">
      <header className="ed-top">
        <Link href="/studio/courses" className="ed-back">→ קורסים</Link>
        <input
          className="ed-title"
          aria-label="שם הקורס"
          value={doc.title}
          disabled={ro}
          onChange={(e) => commit({ ...doc, title: e.target.value }, "course.title")}
        />
        <span className={`chip ${latestVersion ? (unpublished ? "chip-progress" : "chip-done") : "chip-neutral"}`}>{statusLabel}</span>
        <span className={`ed-save ed-save-${save}`} role="status" aria-live="polite">
          {SAVE_TEXT[save]}{save === "invalid" && saveMsg ? `: ${saveMsg}` : ""}
        </span>
        <div className="ed-top-actions">
          <button type="button" className="ed-icon" onClick={undo} disabled={ro || past.current.length === 0} aria-label="ביטול (Ctrl+Z)" title="ביטול (Ctrl+Z)">↶</button>
          <button type="button" className="ed-icon" onClick={redo} disabled={ro || future.current.length === 0} aria-label="חזרה (Ctrl+Y)" title="חזרה (Ctrl+Y)">↷</button>
          <button type="button" className={`btn btn-quiet btn-sm ${errors.length ? "has-errors" : ""}`} aria-pressed={panel === "issues"} onClick={() => setPanel(panel === "issues" ? "screen" : "issues")}>
            בדיקת תקינות {errors.length + warnings.length > 0 ? `(${errors.length + warnings.length})` : "✓"}
          </button>
          {canPublish && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPublishOpen(true); setPublishMsg(null); }}>
              פרסום
            </button>
          )}
        </div>
      </header>

      {publishMsg && !publishOpen && (
        <p className={`ed-banner ed-banner-${publishMsg.tone}`} role="status">{publishMsg.text}</p>
      )}

      <div className="ed-body">
        {/* ───── Structure (right) ───── */}
        <nav className="ed-tree" aria-label="מבנה הקורס">
          <h2 className="ed-pane-title">מבנה הקורס</h2>
          {doc.units.map((u, ui) => (
            <section key={u.id} className="ed-unit">
              <div className="ed-unit-head">
                <input aria-label={`שם יחידה ${ui + 1}`} value={u.title} disabled={ro} onChange={(e) => commit(ops.renameUnit(doc, u.id, e.target.value), `${u.id}.title`)} />
                <button type="button" className="ed-icon" aria-label="הזזת היחידה למעלה" disabled={ro || ui === 0} onClick={() => commit(ops.moveUnit(doc, u.id, -1))}>▲</button>
                <button type="button" className="ed-icon" aria-label="הזזת היחידה למטה" disabled={ro || ui === doc.units.length - 1} onClick={() => commit(ops.moveUnit(doc, u.id, 1))}>▼</button>
                {confirmDel === u.id ? (
                  <span className="ed-confirm">
                    למחוק את היחידה ו-{u.screens.length} מסכים?
                    <button type="button" className="ed-link-danger" onClick={() => { commit(ops.deleteUnit(doc, u.id)); setConfirmDel(null); if (u.screens.some((s) => s.id === screenId)) setScreenId(null); }}>מחיקה</button>
                    <button type="button" className="ed-link" onClick={() => setConfirmDel(null)}>ביטול</button>
                  </span>
                ) : (
                  <button type="button" className="ed-icon" aria-label="מחיקת היחידה" disabled={ro} onClick={() => setConfirmDel(u.id)}>✕</button>
                )}
              </div>
              <ol className="ed-screens">
                {u.screens.map((s, si) => (
                  <li key={s.id} className={s.id === screenId ? "is-selected" : ""}>
                    <button type="button" className="ed-screen" aria-current={s.id === screenId ? "true" : undefined} onClick={() => { setScreenId(s.id); setPanel("screen"); setOpenComp(null); }}>
                      <span className="ed-screen-n">{si + 1}</span>
                      <span className="ed-screen-text">
                        <span className="ed-screen-title">{s.title || "ללא שם"}</span>
                        <span className="ed-screen-tpl">{TEMPLATES[s.template].label}{s.medical.relevant ? " · רפואי" : ""}</span>
                      </span>
                      {issuesByScreen.get(s.id) ? <span className="ed-dot" aria-label={`${issuesByScreen.get(s.id)} בעיות`}>{issuesByScreen.get(s.id)}</span> : null}
                    </button>
                    {s.id === screenId && !ro && (
                      <div className="ed-screen-actions">
                        <button type="button" className="ed-icon" aria-label="הזזת המסך למעלה" disabled={si === 0} onClick={() => commit(ops.moveScreen(doc, s.id, -1))}>▲</button>
                        <button type="button" className="ed-icon" aria-label="הזזת המסך למטה" disabled={si === u.screens.length - 1} onClick={() => commit(ops.moveScreen(doc, s.id, 1))}>▼</button>
                        <button type="button" className="ed-link" onClick={() => { const r = ops.duplicateScreen(doc, s.id); commit(r.course); setScreenId(r.screenId); }}>שכפול</button>
                        {confirmDel === s.id ? (
                          <>
                            <button type="button" className="ed-link-danger" onClick={() => { commit(ops.deleteScreen(doc, s.id)); setScreenId(null); setConfirmDel(null); }}>מחיקה סופית</button>
                            <button type="button" className="ed-link" onClick={() => setConfirmDel(null)}>ביטול</button>
                          </>
                        ) : (
                          <button type="button" className="ed-link-danger" onClick={() => setConfirmDel(s.id)}>מחיקה</button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {!ro && (pickerFor === u.id ? (
                <div className="ed-picker" role="group" aria-label="בחירת סוג מסך">
                  {ops.AUTHORABLE_TEMPLATES.map((t) => (
                    <button key={t} type="button" onClick={() => { const r = ops.addScreen(doc, u.id, t); commit(r.course); setScreenId(r.screenId); setPickerFor(null); setPanel("screen"); }}>
                      <strong>{TEMPLATES[t].label}</strong>
                      <span>{TEMPLATES[t].description}</span>
                    </button>
                  ))}
                  <p className="ef-hint">מסכים עם תמונות וסרטונים יתווספו עם ספריית המדיה.</p>
                  <button type="button" className="ed-link" onClick={() => setPickerFor(null)}>ביטול</button>
                </div>
              ) : (
                <button type="button" className="ed-add" onClick={() => setPickerFor(u.id)}>+ מסך</button>
              ))}
            </section>
          ))}
          {!ro && <button type="button" className="ed-add ed-add-unit" onClick={() => commit(ops.addUnit(doc).course)}>+ יחידה</button>}
        </nav>

        {/* ───── Canvas (center) ───── */}
        <section className="ed-canvas" aria-label="תצוגה מקדימה">
          <div className="canvas-toolbar">
            <div className="segmented" role="group" aria-label="תצוגת מכשיר">
              {(["mobile", "desktop"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "mobile" ? "נייד" : "מחשב"}</button>
              ))}
            </div>
            <span className="ef-hint">תצוגה חיה. אפשר לענות ולנסות את המסך.</span>
          </div>
          <div className={`device device-${device}`}>
            <div className="device-screen">
              {!selected ? (
                <p className="ed-empty">בחרו מסך מהמבנה, או הוסיפו מסך חדש.</p>
              ) : previewState && parsed.success ? (
                <CoursePlayer key={`${selected.id}:${JSON.stringify(selected).length}:${epoch}:${past.current.length}`} course={parsed.data} resolveMedia={resolveMedia} initialState={previewState} />
              ) : (
                <p className="ed-empty">התצוגה תתעדכן כשכל שדות החובה יהיו מלאים.</p>
              )}
            </div>
          </div>
        </section>

        {/* ───── Properties / issues (left) ───── */}
        <aside className="ed-props" aria-label={panel === "issues" ? "בדיקת תקינות" : "מאפייני המסך"}>
          {panel === "issues" ? (
            <div className="ed-issues">
              <h2 className="ed-pane-title">בדיקת תקינות</h2>
              <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
              {validation.issues.length === 0 && <p className="validity is-ok">לא נמצאו בעיות</p>}
              <ul className="issues">
                {validation.issues.map((i, n) => (
                  <li key={n} className={`issue issue-${i.severity}`}>
                    <span className="issue-sev">{i.severity === "error" ? "שגיאה" : i.severity === "warning" ? "אזהרה" : "מידע"}</span>
                    {i.screenId && ops.findScreen(doc, i.screenId) ? (
                      <button type="button" className="ed-link" onClick={() => { setScreenId(i.screenId!); setPanel("screen"); }}>{i.message}</button>
                    ) : (
                      <span>{i.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : selected ? (
            <div className="ed-screen-props" key={`${selected.id}:${epoch}`}>
              <h2 className="ed-pane-title">מאפייני המסך</h2>
              <Field label="שם המסך">
                {(id) => <input id={id} value={selected.title} disabled={ro} onChange={(e) => patchScreen((s) => (s.title = e.target.value), `${selected.id}.title`)} />}
              </Field>
              <p className="ef-hint">סוג: {TEMPLATES[selected.template].label}</p>
              <label className="ef-check">
                <input type="checkbox" checked={selected.required} disabled={ro} onChange={(e) => patchScreen((s) => (s.required = e.target.checked), `${selected.id}.req`)} />
                מסך חובה להשלמת הקורס
              </label>
              <label className="ef-check">
                <input type="checkbox" checked={selected.medical.relevant} disabled={ro} onChange={(e) => patchScreen((s) => (s.medical.relevant = e.target.checked), `${selected.id}.med`)} />
                מכיל תוכן רפואי (דורש אישור מקצועי לפני פרסום)
              </label>
              <Field label="אחרי המסך הזה">
                {(id) => <TargetSelect id={id} course={doc} screenId={selected.id} value={selected.flow.default} disabled={ro} onChange={(t) => t && patchScreen((s) => (s.flow.default = t), `${selected.id}.flow`)} />}
              </Field>

              {TEMPLATES[selected.template].slots.map((slot) => {
                const items = selected.slots[slot.id] ?? [];
                const addable = ops.allowedToAdd(selected.template, slot.id);
                return (
                  <section key={slot.id} className="ed-slot">
                    <h3>{slot.label}</h3>
                    {items.length === 0 && <p className="ef-hint">אין רכיבים באזור הזה.</p>}
                    {items.map((c, ci) => {
                      const open = openComp === c.id;
                      return (
                        <div key={c.id} className={`ed-comp${open ? " is-open" : ""}`}>
                          <div className="ed-comp-head">
                            <button type="button" className="ed-comp-toggle" aria-expanded={open} onClick={() => setOpenComp(open ? null : c.id)}>
                              <span className="ed-comp-type">{ops.COMPONENT_LABEL[c.type]}</span>
                              <span className="ed-comp-sum">{summary(c)}</span>
                            </button>
                            {!ro && (
                              <>
                                <button type="button" className="ed-icon" aria-label="הזזה למעלה" disabled={ci === 0} onClick={() => commit(ops.moveComponent(doc, selected.id, c.id, -1))}>▲</button>
                                <button type="button" className="ed-icon" aria-label="הזזה למטה" disabled={ci === items.length - 1} onClick={() => commit(ops.moveComponent(doc, selected.id, c.id, 1))}>▼</button>
                                <button type="button" className="ed-icon" aria-label="מחיקת הרכיב" disabled={items.length <= slot.min} onClick={() => commit(ops.removeComponent(doc, selected.id, c.id))}>✕</button>
                              </>
                            )}
                          </div>
                          {open && (
                            <div className="ed-comp-body">
                              <ComponentForm
                                c={c}
                                course={doc}
                                screen={selected}
                                disabled={ro}
                                patch={(fn, key) => commit(ops.updateComponent(doc, selected.id, c.id, fn), key)}
                                setBranch={(optionId: string, t: FlowTarget | null) => commit(ops.setChoiceBranch(doc, selected.id, c.id, optionId, t))}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!ro && items.length < slot.max && addable.length > 0 && (
                      <AddComponent types={addable} onAdd={(t) => { const r = ops.addComponent(doc, selected.id, slot.id, t); commit(r.course); setOpenComp(r.componentId); }} />
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="ed-empty">בחרו מסך כדי לערוך אותו.</p>
          )}
        </aside>
      </div>

      {publishOpen && (
        <div className="ed-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setPublishOpen(false)}>
          <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="pub-title">
            <h2 id="pub-title">פרסום גרסה {(latestVersion ?? 0) + 1}</h2>
            <p className="muted">הגרסה המפורסמת היא מה שהלומדים יראו. לומדים שכבר התחילו ממשיכים בגרסה שבה התחילו.</p>
            {errors.length > 0 ? (
              <>
                <p className="validity is-bad">יש {errors.length} שגיאות שחוסמות פרסום</p>
                <ul className="issues">{errors.slice(0, 6).map((i, n) => <li key={n} className="issue issue-error"><span className="issue-sev">שגיאה</span><span>{i.message}</span></li>)}</ul>
              </>
            ) : (
              <p className="validity is-ok">בדיקת התקינות עברה{warnings.length ? ` (${warnings.length} אזהרות)` : ""}</p>
            )}
            <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
            {medicalScreens.length > 0 && (
              <label className="ef-check ed-medical">
                <input type="checkbox" checked={medicalOk} onChange={(e) => setMedicalOk(e.target.checked)} />
                אני מאשר/ת ש-{medicalScreens.length} המסכים המסומנים כתוכן רפואי נבדקו ואושרו על ידי גורם מקצועי מוסמך. האישור נרשם ביומן המערכת.
              </label>
            )}
            {publishMsg && <p className={`ed-banner ed-banner-${publishMsg.tone}`} role="alert">{publishMsg.text}</p>}
            <div className="ed-modal-actions">
              <button type="button" className="btn btn-primary" disabled={publishing || errors.length > 0 || (medicalScreens.length > 0 && !medicalOk)} onClick={publish}>
                {publishing ? "מפרסם…" : "פרסום"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setPublishOpen(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddComponent({ types, onAdd }: { types: ComponentType[]; onAdd: (t: ComponentType) => void }) {
  const [t, setT] = useState<ComponentType>(types[0]!);
  return (
    <div className="ed-addcomp">
      <select aria-label="סוג רכיב להוספה" value={t} onChange={(e) => setT(e.target.value as ComponentType)}>
        {types.map((x) => <option key={x} value={x}>{ops.COMPONENT_LABEL[x]}</option>)}
      </select>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onAdd(t)}>+ הוספת רכיב</button>
    </div>
  );
}

function summary(c: Component): string {
  switch (c.type) {
    case "heading": return c.text;
    case "richText":
    case "callout": return ops.blocksToText(c.body).slice(0, 60);
    case "button": return c.label;
    case "choiceQuestion":
    case "trueFalse":
    case "sequenceTask":
    case "hotspotImage": return c.prompt;
    default: return "";
  }
}
