"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Component, type ComponentType, type Course, type FlowTarget, TEMPLATES, type TemplateId } from "@mozes/content-schema";
import type { MediaResolver } from "@mozes/player-react";
import { TECHNICAL_ONLY_NOTICE, validateCourse } from "@mozes/validator";
import { MediaLibrary } from "@/components/media/MediaLibrary";
import type { AssetView } from "@/components/media/upload";
import { DEMO_MEDIA } from "@/content/demo-course";
import { ComponentForm, Field, TargetSelect } from "./ComponentForm";
import { PreviewDialog } from "./PreviewDialog";
import * as ops from "./ops";

type Save = "saved" | "dirty" | "saving" | "offline" | "conflict" | "invalid";
const SAVE_TEXT: Record<Save, string> = {
  saved: "כל השינויים נשמרו",
  dirty: "יש שינויים שלא נשמרו",
  saving: "שומר…",
  offline: "אין חיבור. ננסה לשמור שוב",
  conflict: "הפרק נשמר במקום אחר. רעננו את הדף כדי להמשיך",
  invalid: "לא נשמר",
};

export interface ChapterEditorProps {
  chapterId: string;
  initial: Course;
  revision: number;
  usedIn: { id: string; title: string }[];
  canEdit: boolean;
  canManageMedia: boolean;
  /** assetId → URL for files the chapter already uses. */
  media: Record<string, { src: string; mime?: string }>;
}

type MediaKind = AssetView["kind"];

/**
 * The chapter builder: a chapter is one ordered list of screens. Authors work on one screen at a
 * time in a wide editing area; the learner view opens on demand (phone / computer).
 */
export function ChapterEditor(props: ChapterEditorProps) {
  const { chapterId, canEdit } = props;
  const [doc, setDoc] = useState<Course>(props.initial);
  const [epoch, setEpoch] = useState(0); // bumps on undo/redo so uncontrolled fields remount
  const past = useRef<Course[]>([]);
  const future = useRef<Course[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);

  const unit = doc.units[0]!;
  const [screenId, setScreenId] = useState<string | null>(unit.screens[0]?.id ?? null);
  const [openComp, setOpenComp] = useState<string | null>(null);
  const [panel, setPanel] = useState<"screen" | "issues">("screen");
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  /* ───────── media ───────── */
  const [mediaMap, setMediaMap] = useState(props.media);
  const resolveMedia: MediaResolver = useCallback((ref) => mediaMap[ref.assetId] ?? DEMO_MEDIA[ref.assetId] ?? null, [mediaMap]);
  const [picker, setPicker] = useState<{ kinds: MediaKind[]; title: string; onPick: (a: AssetView) => void } | null>(null);
  const pickMedia = useCallback((kinds: MediaKind[], title: string, onPick: (a: AssetView) => void) => setPicker({ kinds, title, onPick }), []);
  const picked = (a: AssetView) => {
    setMediaMap((m) => ({ ...m, [a.id]: { src: a.url, mime: a.mime } }));
    const p = picker;
    setPicker(null);
    p?.onPick(a);
  };

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

  /* ───────── autosave ("נשמר" only after the server confirms) ───────── */
  const [save, setSave] = useState<Save>("saved");
  const [saveMsg, setSaveMsg] = useState("");
  const revision = useRef(props.revision);
  const savedDoc = useRef<Course>(props.initial);
  const inflight = useRef(false);
  const retry = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) return false;
    const sending = docRef.current;
    if (sending === savedDoc.current) return true;
    inflight.current = true;
    setSave("saving");
    try {
      const res = await fetch(`/api/studio/chapters/${chapterId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: sending, baseRevision: revision.current }),
      });
      inflight.current = false;
      if (res.ok) {
        revision.current = ((await res.json()) as { revision: number }).revision;
        savedDoc.current = sending;
        retry.current = 0;
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
  }, [chapterId]);

  useEffect(() => {
    if (save === "conflict") return;
    if (doc === savedDoc.current) {
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
  const problems = validation.issues.filter((i) => i.severity !== "info");
  const errors = problems.filter((i) => i.severity === "error");
  const issuesByScreen = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of problems) if (i.screenId) m.set(i.screenId, (m.get(i.screenId) ?? 0) + 1);
    return m;
  }, [problems]);
  const selected = screenId ? ops.findScreen(doc, screenId)?.screen ?? null : null;
  const selectedIndex = selected ? unit.screens.findIndex((s) => s.id === selected.id) : -1;
  const isExam = unit.kind === "exam";

  /* ───────── helpers ───────── */
  const ro = !canEdit;
  const patchScreen = (fn: Parameters<typeof ops.updateScreen>[2], key: string) => selected && commit(ops.updateScreen(doc, selected.id, fn), key);
  const setTitle = (title: string) => commit({ ...doc, title, units: [{ ...unit, title }] }, "chapter.title");
  const setKind = (kind: "lesson" | "exam") => commit({ ...doc, units: [{ ...unit, kind }] });
  const select = (id: string) => { setScreenId(id); setPanel("screen"); setOpenComp(null); setConfirmDel(null); };
  const addScreen = (t: TemplateId, media?: AssetView) => {
    const r = ops.addScreen(docRef.current, unit.id, t, media);
    commit(r.course);
    select(r.screenId);
    setAdding(false);
  };

  return (
    <div className="ed">
      <header className="ed-top">
        <Link href="/studio/chapters" className="ed-back">→ מאגר הפרקים</Link>
        <input className="ed-title" aria-label="שם הפרק" value={doc.title} disabled={ro} onChange={(e) => setTitle(e.target.value)} />
        <div className="segmented" role="group" aria-label="סוג הפרק">
          <button type="button" aria-pressed={!isExam} disabled={ro} onClick={() => setKind("lesson")}>שיעור</button>
          <button type="button" aria-pressed={isExam} disabled={ro} onClick={() => setKind("exam")}>מבחן</button>
        </div>
        <span className={`ed-save ed-save-${save}`} role="status" aria-live="polite">
          {SAVE_TEXT[save]}{save === "invalid" && saveMsg ? `: ${saveMsg}` : ""}
        </span>
        <div className="ed-top-actions">
          <button type="button" className="ed-icon" onClick={undo} disabled={ro || past.current.length === 0} aria-label="ביטול (Ctrl+Z)" title="ביטול (Ctrl+Z)">↶</button>
          <button type="button" className="ed-icon" onClick={redo} disabled={ro || future.current.length === 0} aria-label="חזרה (Ctrl+Y)" title="חזרה (Ctrl+Y)">↷</button>
          <button type="button" className={`btn btn-quiet btn-sm ${errors.length ? "has-errors" : ""}`} aria-pressed={panel === "issues"} onClick={() => setPanel(panel === "issues" ? "screen" : "issues")}>
            בדיקת תקינות {problems.length > 0 ? `(${problems.length})` : "✓"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreview(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            תצוגה מקדימה
          </button>
        </div>
      </header>

      <p className="ed-banner ed-banner-info">
        {isExam ? "פרק מבחן: השאלות בו קובעות את הציון בקורס. " : "פרק שיעור: שאלות כאן הן תרגול ואינן נספרות בציון כשבקורס יש מבחן. "}
        {props.usedIn.length
          ? <>משמש בקורסים: {props.usedIn.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/studio/courses/${c.id}`}>{c.title}</Link></span>)}. השינויים יגיעו ללומדים אחרי פרסום מחדש של הקורס.</>
          : "הפרק עדיין לא משובץ באף קורס."}
      </p>

      <div className="ed-body ed-body-2">
        {/* ───── Screens (right) ───── */}
        <nav className="ed-tree" aria-label="מסכי הפרק">
          <div className="ed-tree-head">
            <h2 className="ed-pane-title">מסכי הפרק</h2>
            <span className="muted ed-count">{unit.screens.length}</span>
          </div>
          {unit.screens.length === 0 && <p className="ef-hint">עדיין אין מסכים. הוסיפו את המסך הראשון.</p>}
          <ol className="ed-screens">
            {unit.screens.map((s, si) => (
              <li key={s.id} className={s.id === screenId ? "is-selected" : ""}>
                <button type="button" className="ed-screen" aria-current={s.id === screenId ? "true" : undefined} onClick={() => select(s.id)}>
                  <span className="ed-screen-n">{si + 1}</span>
                  <span className="ed-screen-text">
                    <span className="ed-screen-title">{s.title || "ללא שם"}</span>
                    <span className="ed-screen-tpl">{TEMPLATES[s.template].label}{s.medical.relevant ? " · רפואי" : ""}</span>
                  </span>
                  {issuesByScreen.get(s.id) ? <span className="ed-dot" aria-label={`${issuesByScreen.get(s.id)} בעיות`}>{issuesByScreen.get(s.id)}</span> : null}
                </button>
              </li>
            ))}
          </ol>
          {!ro && <button type="button" className="btn btn-quiet ed-add-screen" onClick={() => setAdding(true)}>+ הוספת מסך</button>}
        </nav>

        {/* ───── Work area ───── */}
        <section className="ed-main" aria-label={panel === "issues" ? "בדיקת תקינות" : "עריכת המסך"}>
          {panel === "issues" ? (
            <div className="ed-card ed-issues">
              <h2 className="ed-main-title">בדיקת תקינות</h2>
              <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
              {problems.length === 0 && <p className="validity is-ok">לא נמצאו בעיות</p>}
              <ul className="issues">
                {problems.map((i, n) => (
                  <li key={n} className={`issue issue-${i.severity}`}>
                    <span className="issue-sev">{i.severity === "error" ? "שגיאה" : "אזהרה"}</span>
                    {i.screenId && ops.findScreen(doc, i.screenId) ? (
                      <button type="button" className="ed-link" onClick={() => select(i.screenId!)}>{i.message}</button>
                    ) : (
                      <span>{i.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : selected ? (
            <div className="ed-screen-edit" key={`${selected.id}:${epoch}`}>
              <div className="ed-main-head">
                <div>
                  <p className="kicker">מסך {selectedIndex + 1} מתוך {unit.screens.length} · {TEMPLATES[selected.template].label}</p>
                  <h2 className="ed-main-title">{selected.title || "ללא שם"}</h2>
                </div>
                {!ro && (
                  <div className="ed-main-actions">
                    <button type="button" className="ed-icon" aria-label="הזזת המסך למעלה" title="הזזה למעלה" disabled={selectedIndex === 0} onClick={() => commit(ops.moveScreen(doc, selected.id, -1))}>▲</button>
                    <button type="button" className="ed-icon" aria-label="הזזת המסך למטה" title="הזזה למטה" disabled={selectedIndex === unit.screens.length - 1} onClick={() => commit(ops.moveScreen(doc, selected.id, 1))}>▼</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => { const r = ops.duplicateScreen(doc, selected.id); commit(r.course); select(r.screenId); }}>שכפול</button>
                    {confirmDel === selected.id ? (
                      <span className="ed-confirm">
                        למחוק את המסך?
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => { const next = unit.screens[selectedIndex + 1] ?? unit.screens[selectedIndex - 1]; commit(ops.deleteScreen(doc, selected.id)); setScreenId(next?.id ?? null); setConfirmDel(null); }}>מחיקה</button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDel(null)}>ביטול</button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-quiet btn-sm ed-danger-text" onClick={() => setConfirmDel(selected.id)}>מחיקה</button>
                    )}
                  </div>
                )}
              </div>

              <div className="ed-card ed-settings">
                <Field label="שם המסך">
                  {(id) => <input id={id} value={selected.title} disabled={ro} onChange={(e) => patchScreen((s) => (s.title = e.target.value), `${selected.id}.title`)} />}
                </Field>
                <Field label="אחרי המסך הזה">
                  {(id) => <TargetSelect id={id} course={doc} screenId={selected.id} value={selected.flow.default} disabled={ro} onChange={(t) => t && patchScreen((s) => (s.flow.default = t), `${selected.id}.flow`)} />}
                </Field>
                <label className="ef-check">
                  <input type="checkbox" checked={selected.required} disabled={ro} onChange={(e) => patchScreen((s) => (s.required = e.target.checked), `${selected.id}.req`)} />
                  מסך חובה להשלמת הקורס
                </label>
                <label className="ef-check">
                  <input type="checkbox" checked={selected.medical.relevant} disabled={ro} onChange={(e) => patchScreen((s) => (s.medical.relevant = e.target.checked), `${selected.id}.med`)} />
                  מכיל תוכן רפואי (דורש אישור מקצועי לפני פרסום הקורס)
                </label>
              </div>

              {TEMPLATES[selected.template].slots.map((slot) => {
                const items = selected.slots[slot.id] ?? [];
                const addable = ops.allowedToAdd(selected.template, slot.id);
                return (
                  <section key={slot.id} className="ed-card ed-slot">
                    <h3 className="ed-slot-title">{slot.label}</h3>
                    {items.length === 0 && <p className="ef-hint">אין רכיבים באזור הזה.</p>}
                    {items.map((c, ci) => {
                      const open = openComp === c.id;
                      return (
                        <div key={c.id} className={`ed-comp${open ? " is-open" : ""}`}>
                          <div className="ed-comp-head">
                            <button type="button" className="ed-comp-toggle" aria-expanded={open} onClick={() => setOpenComp(open ? null : c.id)}>
                              <span className="ed-comp-type">{ops.COMPONENT_LABEL[c.type]}</span>
                              <span className="ed-comp-sum">{summary(c) || "לחצו לעריכה"}</span>
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
                                media={mediaMap}
                                pickMedia={pickMedia}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!ro && items.length < slot.max && addable.length > 0 && (
                      <AddComponent
                        types={addable}
                        onAdd={(t) => {
                          if (ops.MEDIA_TYPES.includes(t)) {
                            pickMedia([t as MediaKind], `בחירת ${ops.COMPONENT_LABEL[t]}`, (a) => {
                              const r = ops.addComponent(docRef.current, selected.id, slot.id, t, a);
                              commit(r.course);
                              setOpenComp(r.componentId);
                            });
                          } else {
                            const r = ops.addComponent(doc, selected.id, slot.id, t);
                            commit(r.course);
                            setOpenComp(r.componentId);
                          }
                        }}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="ed-card ed-empty">
              <p>בחרו מסך מהרשימה, או הוסיפו מסך חדש.</p>
              {!ro && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>+ הוספת מסך</button>}
            </div>
          )}
        </section>
      </div>

      {adding && (
        <div className="ed-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="ed-modal ed-modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <h2 id="add-title">הוספת מסך</h2>
            <p className="muted">המסך יתווסף בסוף הפרק. אפשר להזיז אותו אחר כך.</p>
            <div className="tpl-grid">
              {ops.AUTHORABLE_TEMPLATES.map((t) => (
                <button key={t} type="button" className="tpl-card" onClick={() => addScreen(t)}>
                  <strong>{TEMPLATES[t].label}</strong>
                  <span>{TEMPLATES[t].description}</span>
                </button>
              ))}
              {(Object.keys(ops.MEDIA_TEMPLATES) as (keyof typeof ops.MEDIA_TEMPLATES)[]).map((t) => (
                <button key={t} type="button" className="tpl-card" onClick={() => pickMedia(ops.MEDIA_TEMPLATES[t]!, `בחירת קובץ ל${TEMPLATES[t].label}`, (a) => addScreen(t, a))}>
                  <strong>{TEMPLATES[t].label}</strong>
                  <span>{TEMPLATES[t].description}</span>
                  <em>דורש קובץ מספריית המדיה</em>
                </button>
              ))}
            </div>
            <div className="ed-modal-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {picker && (
        <div className="ed-modal-backdrop ed-modal-top" role="presentation" onClick={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div className="ed-modal ed-modal-wide" role="dialog" aria-modal="true" aria-labelledby="picker-title">
            <h2 id="picker-title">{picker.title}</h2>
            <p className="muted">בחרו קובץ מהספרייה, או העלו קובץ חדש. קובץ שמועלה כאן נבחר אוטומטית.</p>
            <MediaLibrary mode="pick" kinds={picker.kinds} onPick={picked} canManage={props.canManageMedia} />
            <div className="ed-modal-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setPicker(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {preview && <PreviewDialog content={doc} resolveMedia={resolveMedia} fromScreenId={screenId} onClose={() => setPreview(false)} />}
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
    case "interactiveScene": return c.scene.title;
    case "heading": return c.text;
    case "richText":
    case "callout": return ops.blocksToText(c.body).slice(0, 80);
    case "button": return c.label;
    case "choiceQuestion":
    case "trueFalse":
    case "sequenceTask":
    case "hotspotImage": return c.prompt;
    default: return "";
  }
}
