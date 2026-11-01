"use client";

import { useId } from "react";
import type { Component, Course, FlowTarget, Screen } from "@mozes/content-schema";
import { flattenScreens } from "@mozes/content-schema";
import type { AssetView } from "@/components/media/upload";
import { blocksToText, newId, textToBlocks } from "./ops";

type MediaMap = Record<string, { src: string; mime?: string }>;
type PickMedia = (kinds: AssetView["kind"][], title: string, onPick: (a: AssetView) => void) => void;

function MediaField({ label, assetId, media, kinds, pickMedia, onChange, onClear, disabled }: {
  label: string;
  assetId: string | undefined;
  media: MediaMap;
  kinds: AssetView["kind"][];
  pickMedia: PickMedia;
  onChange: (a: AssetView) => void;
  onClear?: () => void;
  disabled: boolean;
}) {
  const m = assetId ? media[assetId] : undefined;
  return (
    <div className="ef">
      <span className="ef-label">{label}</span>
      <div className="media-field">
        {m && kinds.includes("image") && !m.mime?.startsWith("video") && !m.mime?.startsWith("text") ? <img src={m.src} alt="" /> : null}
        {m && m.mime?.startsWith("video") ? <video src={m.src} preload="metadata" muted aria-hidden="true" /> : null}
        <span className="media-field-name">{assetId ? (m ? "קובץ נבחר" : "הקובץ אינו זמין") : "לא נבחר קובץ"}</span>
        <button type="button" className="btn btn-quiet btn-sm" disabled={disabled} onClick={() => pickMedia(kinds, label, onChange)}>
          {assetId ? "החלפה" : "בחירה"}
        </button>
        {assetId && onClear && (
          <button type="button" className="ed-link-danger" disabled={disabled} onClick={onClear}>הסרה</button>
        )}
      </div>
    </div>
  );
}

type Patch = (fn: (c: Component) => void, key: string) => void;

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="ef">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="ef-hint">{hint}</p>}
    </div>
  );
}

export function TargetSelect({
  course,
  screenId,
  value,
  onChange,
  allowNone,
  disabled,
  id,
}: {
  course: Course;
  screenId: string;
  value: FlowTarget | null;
  onChange: (t: FlowTarget | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const screens = flattenScreens(course).filter((r) => r.screen.id !== screenId);
  const v = !value ? "" : value.kind === "goto" ? `goto:${value.screenId}` : value.kind;
  return (
    <select
      id={id}
      value={v}
      disabled={disabled}
      onChange={(e) => {
        const x = e.target.value;
        onChange(x === "" ? null : x === "next" ? { kind: "next" } : x === "end" ? { kind: "end" } : { kind: "goto", screenId: x.slice(5) });
      }}
    >
      {allowNone && <option value="">המשך רגיל (כמו ברירת המחדל של המסך)</option>}
      <option value="next">המסך הבא ברשימה</option>
      <option value="end">סיום הקורס</option>
      <optgroup label="מעבר למסך">
        {screens.map((r) => (
          <option key={r.screen.id} value={`goto:${r.screen.id}`}>
            {r.unit.title} · {r.screen.title}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function QuestionCommon({ c, patch, disabled }: { c: Extract<Component, { maxAttempts: number }>; patch: Patch; disabled: boolean }) {
  return (
    <>
      <div className="ef-row">
        <Field label="ניקוד">
          {(id) => (
            <input id={id} type="number" min={0} max={100} value={c.points} disabled={disabled}
              onChange={(e) => patch((x) => ("points" in x ? (x.points = Math.max(0, Math.min(100, Number(e.target.value) || 0))) : 0), `${c.id}.points`)} />
          )}
        </Field>
        <Field label="ניסיונות">
          {(id) => (
            <input id={id} type="number" min={1} max={10} value={c.maxAttempts} disabled={disabled}
              onChange={(e) => patch((x) => ("maxAttempts" in x ? (x.maxAttempts = Math.max(1, Math.min(10, Number(e.target.value) || 1))) : 0), `${c.id}.attempts`)} />
          )}
        </Field>
      </div>
      <label className="ef-check">
        <input type="checkbox" checked={c.showCorrectAfterFinalAttempt} disabled={disabled}
          onChange={(e) => patch((x) => ("showCorrectAfterFinalAttempt" in x ? (x.showCorrectAfterFinalAttempt = e.target.checked) : 0), `${c.id}.show`)} />
        הצגת התשובה הנכונה אחרי הניסיון האחרון
      </label>
      <Field label="משוב לתשובה נכונה">
        {(id) => <textarea id={id} rows={2} value={c.feedback.correct} disabled={disabled} onChange={(e) => patch((x) => ("feedback" in x ? (x.feedback.correct = e.target.value) : 0), `${c.id}.fbc`)} />}
      </Field>
      <Field label="משוב לתשובה שגויה">
        {(id) => <textarea id={id} rows={2} value={c.feedback.incorrect} disabled={disabled} onChange={(e) => patch((x) => ("feedback" in x ? (x.feedback.incorrect = e.target.value) : 0), `${c.id}.fbi`)} />}
      </Field>
    </>
  );
}

export function ComponentForm({
  c,
  course,
  screen,
  patch,
  setBranch,
  disabled,
  media,
  pickMedia,
}: {
  c: Component;
  course: Course;
  screen: Screen;
  patch: Patch;
  setBranch: (optionId: string, t: FlowTarget | null) => void;
  disabled: boolean;
  media: MediaMap;
  pickMedia: PickMedia;
}) {
  switch (c.type) {
    case "image":
      return (
        <>
          <MediaField label="תמונה" assetId={c.media.assetId} media={media} kinds={["image"]} pickMedia={pickMedia} disabled={disabled}
            onChange={(a) => patch((x) => { if (x.type === "image") { x.media = { assetId: a.id }; if (!x.alt) x.alt = a.altText; } }, `${c.id}.media`)} />
          <label className="ef-check">
            <input type="checkbox" checked={c.decorative} disabled={disabled} onChange={(e) => patch((x) => x.type === "image" && (x.decorative = e.target.checked), `${c.id}.deco`)} />
            תמונה דקורטיבית בלבד (בלי מידע חשוב)
          </label>
          {!c.decorative && (
            <Field label="תיאור התמונה (לנגישות)" hint="מה רואים בתמונה, במשפט אחד. קוראי מסך מקריאים אותו.">
              {(id) => <input id={id} value={c.alt} disabled={disabled} onChange={(e) => patch((x) => x.type === "image" && (x.alt = e.target.value), `${c.id}.alt`)} />}
            </Field>
          )}
          <Field label="כיתוב מתחת לתמונה (לא חובה)">
            {(id) => <input id={id} value={c.caption ?? ""} disabled={disabled} onChange={(e) => patch((x) => x.type === "image" && (x.caption = e.target.value || undefined), `${c.id}.caption`)} />}
          </Field>
        </>
      );
    case "video":
      return (
        <>
          <MediaField label="סרטון" assetId={c.media.assetId} media={media} kinds={["video"]} pickMedia={pickMedia} disabled={disabled}
            onChange={(a) => patch((x) => x.type === "video" && (x.media = { assetId: a.id }), `${c.id}.media`)} />
          <MediaField label="כתוביות (VTT, מומלץ)" assetId={c.captions?.assetId} media={media} kinds={["captions"]} pickMedia={pickMedia} disabled={disabled}
            onChange={(a) => patch((x) => x.type === "video" && (x.captions = { assetId: a.id }), `${c.id}.captions`)}
            onClear={() => patch((x) => { if (x.type === "video") delete x.captions; }, `${c.id}.captions`)} />
          <MediaField label="תמונת פתיחה (לא חובה)" assetId={c.poster?.assetId} media={media} kinds={["image"]} pickMedia={pickMedia} disabled={disabled}
            onChange={(a) => patch((x) => x.type === "video" && (x.poster = { assetId: a.id }), `${c.id}.poster`)}
            onClear={() => patch((x) => { if (x.type === "video") delete x.poster; }, `${c.id}.poster`)} />
          <div className="ef-row">
            <Field label="חובה לצפות (%)" hint="0 = אין חובה">
              {(id) => <input id={id} type="number" min={0} max={100} value={c.requiredWatchPercent} disabled={disabled}
                onChange={(e) => patch((x) => x.type === "video" && (x.requiredWatchPercent = Math.max(0, Math.min(100, Number(e.target.value) || 0))), `${c.id}.req`)} />}
            </Field>
            {screen.template === "scenario" && (
              <Field label="עצירה והצגת השאלה בשנייה" hint="ריק = בסוף הסרטון">
                {(id) => <input id={id} type="number" min={0} step={0.5} value={c.pauseAtMs === undefined ? "" : c.pauseAtMs / 1000} disabled={disabled}
                  onChange={(e) => patch((x) => { if (x.type === "video") x.pauseAtMs = e.target.value === "" ? undefined : Math.max(0, Math.round(Number(e.target.value) * 1000)); }, `${c.id}.pause`)} />}
              </Field>
            )}
          </div>
          <Field label="תמליל (לנגישות)">
            {(id) => <textarea id={id} rows={3} value={c.transcript ?? ""} disabled={disabled} onChange={(e) => patch((x) => x.type === "video" && (x.transcript = e.target.value || undefined), `${c.id}.transcript`)} />}
          </Field>
        </>
      );
    case "audio":
      return (
        <>
          <MediaField label="קובץ שמע" assetId={c.media.assetId} media={media} kinds={["audio"]} pickMedia={pickMedia} disabled={disabled}
            onChange={(a) => patch((x) => x.type === "audio" && (x.media = { assetId: a.id }), `${c.id}.media`)} />
          <Field label="תמליל (חובה, לנגישות)">
            {(id) => <textarea id={id} rows={4} value={c.transcript} disabled={disabled} onChange={(e) => patch((x) => x.type === "audio" && (x.transcript = e.target.value), `${c.id}.transcript`)} />}
          </Field>
        </>
      );
    case "heading":
      return (
        <div className="ef-row">
          <Field label="טקסט הכותרת">
            {(id) => <input id={id} value={c.text} disabled={disabled} onChange={(e) => patch((x) => x.type === "heading" && (x.text = e.target.value), `${c.id}.text`)} />}
          </Field>
          <Field label="גודל">
            {(id) => (
              <select id={id} value={c.level} disabled={disabled} onChange={(e) => patch((x) => x.type === "heading" && (x.level = Number(e.target.value) as 1 | 2 | 3), `${c.id}.level`)}>
                <option value={1}>גדולה</option>
                <option value={2}>בינונית</option>
                <option value={3}>קטנה</option>
              </select>
            )}
          </Field>
        </div>
      );
    case "richText":
    case "callout":
      return (
        <>
          {c.type === "callout" && (
            <Field label="סוג ההדגשה">
              {(id) => (
                <select id={id} value={c.tone} disabled={disabled} onChange={(e) => patch((x) => x.type === "callout" && (x.tone = e.target.value as "info"), `${c.id}.tone`)}>
                  <option value="info">מידע</option>
                  <option value="warning">שימו לב</option>
                  <option value="success">חשוב לזכור</option>
                </select>
              )}
            </Field>
          )}
          <Field label="טקסט" hint="שורה ריקה מתחילה פסקה חדשה. שורות שמתחילות ב-״- ״ הופכות לרשימה.">
            {(id) => (
              <textarea id={id} rows={6} defaultValue={blocksToText(c.body)} disabled={disabled}
                onChange={(e) => patch((x) => (x.type === "richText" || x.type === "callout") && (x.body = textToBlocks(e.target.value)), `${c.id}.body`)} />
            )}
          </Field>
        </>
      );
    case "button":
      return (
        <div className="ef-row">
          <Field label="טקסט הכפתור">
            {(id) => <input id={id} value={c.label} disabled={disabled} onChange={(e) => patch((x) => x.type === "button" && (x.label = e.target.value), `${c.id}.label`)} />}
          </Field>
          <Field label="לאן הכפתור מוביל">
            {(id) => <TargetSelect id={id} course={course} screenId={screen.id} value={c.target} disabled={disabled} onChange={(t) => patch((x) => x.type === "button" && t && (x.target = t), `${c.id}.target`)} />}
          </Field>
        </div>
      );
    case "trueFalse":
      return (
        <>
          <Field label="הטענה">
            {(id) => <textarea id={id} rows={2} value={c.prompt} disabled={disabled} onChange={(e) => patch((x) => x.type === "trueFalse" && (x.prompt = e.target.value), `${c.id}.prompt`)} />}
          </Field>
          <Field label="התשובה הנכונה">
            {(id) => (
              <select id={id} value={c.answer ? "t" : "f"} disabled={disabled} onChange={(e) => patch((x) => x.type === "trueFalse" && (x.answer = e.target.value === "t"), `${c.id}.answer`)}>
                <option value="t">נכון</option>
                <option value="f">לא נכון</option>
              </select>
            )}
          </Field>
          <QuestionCommon c={c} patch={patch} disabled={disabled} />
        </>
      );
    case "choiceQuestion": {
      const branchFor = (optionId: string) =>
        screen.flow.rules.find((r) => r.when.componentId === c.id && typeof r.when.outcome === "object" && r.when.outcome.choice === optionId)?.then ?? null;
      return (
        <>
          <Field label="השאלה">
            {(id) => <textarea id={id} rows={2} value={c.prompt} disabled={disabled} onChange={(e) => patch((x) => x.type === "choiceQuestion" && (x.prompt = e.target.value), `${c.id}.prompt`)} />}
          </Field>
          <div className="ef-row">
            <Field label="סוג">
              {(id) => (
                <select id={id} value={c.mode} disabled={disabled} onChange={(e) => patch((x) => x.type === "choiceQuestion" && (x.mode = e.target.value as "single"), `${c.id}.mode`)}>
                  <option value="single">תשובה אחת נכונה</option>
                  <option value="multiple">כמה תשובות נכונות</option>
                </select>
              )}
            </Field>
            <label className="ef-check ef-check-inline">
              <input type="checkbox" checked={c.shuffle} disabled={disabled} onChange={(e) => patch((x) => x.type === "choiceQuestion" && (x.shuffle = e.target.checked), `${c.id}.shuffle`)} />
              ערבוב סדר התשובות
            </label>
          </div>
          <fieldset className="ef-options">
            <legend>תשובות</legend>
            {c.options.map((o, i) => (
              <div key={o.id} className="ef-option">
                <div className="ef-option-head">
                  <label className="ef-check">
                    <input type={c.mode === "single" ? "radio" : "checkbox"} name={`correct-${c.id}`} checked={o.correct} disabled={disabled}
                      onChange={(e) =>
                        patch((x) => {
                          if (x.type !== "choiceQuestion") return;
                          x.options.forEach((opt, j) => {
                            if (j === i) opt.correct = e.target.checked;
                            else if (x.mode === "single" && e.target.checked) opt.correct = false;
                          });
                        }, `${c.id}.correct`)
                      }
                    />
                    נכונה
                  </label>
                  <button type="button" className="ed-icon" aria-label={`מחיקת תשובה ${i + 1}`} disabled={disabled || c.options.length <= 2}
                    onClick={() => patch((x) => x.type === "choiceQuestion" && (x.options = x.options.filter((_, j) => j !== i)), `${c.id}.del${i}`)}>
                    ✕
                  </button>
                </div>
                <input aria-label={`טקסט תשובה ${i + 1}`} value={o.text} disabled={disabled}
                  onChange={(e) => patch((x) => x.type === "choiceQuestion" && (x.options[i]!.text = e.target.value), `${o.id}.text`)} />
                <input aria-label={`משוב לתשובה ${i + 1} (לא חובה)`} placeholder="משוב לתשובה זו (לא חובה)" value={o.feedback ?? ""} disabled={disabled}
                  onChange={(e) => patch((x) => x.type === "choiceQuestion" && (x.options[i]!.feedback = e.target.value || undefined), `${o.id}.fb`)} />
                {c.mode === "single" && (
                  <Field label="אחרי בחירה בתשובה זו">
                    {(id) => <TargetSelect id={id} course={course} screenId={screen.id} value={branchFor(o.id)} allowNone disabled={disabled} onChange={(t) => setBranch(o.id, t)} />}
                  </Field>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-quiet btn-sm" disabled={disabled || c.options.length >= 8}
              onClick={() => patch((x) => x.type === "choiceQuestion" && x.options.push({ id: newId("o"), text: "תשובה חדשה", correct: false }), `${c.id}.add`)}>
              + הוספת תשובה
            </button>
          </fieldset>
          <QuestionCommon c={c} patch={patch} disabled={disabled} />
        </>
      );
    }
    case "sequenceTask":
      return (
        <>
          <Field label="ההוראה">
            {(id) => <textarea id={id} rows={2} value={c.prompt} disabled={disabled} onChange={(e) => patch((x) => x.type === "sequenceTask" && (x.prompt = e.target.value), `${c.id}.prompt`)} />}
          </Field>
          <fieldset className="ef-options">
            <legend>השלבים, לפי הסדר הנכון</legend>
            {c.items.map((it, i) => (
              <div key={it.id} className="ef-seq">
                <span className="ef-seq-n">{i + 1}</span>
                <input aria-label={`שלב ${i + 1}`} value={it.text} disabled={disabled}
                  onChange={(e) => patch((x) => x.type === "sequenceTask" && (x.items[i]!.text = e.target.value), `${it.id}.text`)} />
                <button type="button" className="ed-icon" aria-label={`הזזת שלב ${i + 1} למעלה`} disabled={disabled || i === 0}
                  onClick={() => patch((x) => { if (x.type === "sequenceTask") [x.items[i - 1], x.items[i]] = [x.items[i]!, x.items[i - 1]!]; }, `${c.id}.mv`)}>▲</button>
                <button type="button" className="ed-icon" aria-label={`מחיקת שלב ${i + 1}`} disabled={disabled || c.items.length <= 2}
                  onClick={() => patch((x) => x.type === "sequenceTask" && (x.items = x.items.filter((_, j) => j !== i)), `${c.id}.del`)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-quiet btn-sm" disabled={disabled || c.items.length >= 10}
              onClick={() => patch((x) => x.type === "sequenceTask" && x.items.push({ id: newId("i"), text: "שלב חדש" }), `${c.id}.add`)}>
              + הוספת שלב
            </button>
          </fieldset>
          <QuestionCommon c={c} patch={patch} disabled={disabled} />
        </>
      );
    default:
      return <p className="ef-hint">עריכת רכיב מסוג זה תתאפשר עם ספריית המדיה.</p>;
  }
}
