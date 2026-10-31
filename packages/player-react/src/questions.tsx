"use client";

import { useId, useMemo, useState } from "react";
import type { ComponentOf, QuestionComponent } from "@mozes/content-schema";
import type { Response } from "@mozes/player-core";
import { MissingMedia } from "./content";
import { usePlayer } from "./context";

/* ───────────── Helpers ───────────── */

/** Deterministic shuffle (same order on every render/device for a given seed). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function useQuestion(q: QuestionComponent) {
  const { state, dispatch } = usePlayer();
  const qs = state.questions[q.id];
  const resolved = !!qs?.resolved;
  const revealCorrect = resolved && !qs?.correct && q.showCorrectAfterFinalAttempt;
  const submit = (response: Response) => dispatch({ type: "answer", componentId: q.id, response });
  return { qs, resolved, revealCorrect, submit, attemptsLeft: q.maxAttempts - (qs?.attempts ?? 0) };
}

function Feedback({ q, extra }: { q: QuestionComponent; extra?: string[] }) {
  const { state } = usePlayer();
  const qs = state.questions[q.id];
  if (!qs) return <div className="mp-feedback-region" aria-live="polite" />;
  const tone = qs.correct ? "correct" : "incorrect";
  const general = qs.correct ? q.feedback.correct : q.feedback.incorrect;
  const status = qs.correct
    ? "תשובה נכונה"
    : qs.resolved
      ? "התשובה אינה נכונה"
      : `התשובה אינה נכונה. נותרו ${q.maxAttempts - qs.attempts} ניסיונות`;
  return (
    <div className="mp-feedback-region" aria-live="polite">
      <div className={`mp-feedback mp-feedback-${tone}`} key={qs.attempts}>
        <p className="mp-feedback-status">{status}</p>
        {general && <p>{general}</p>}
        {extra?.filter(Boolean).map((t, i) => <p key={i}>{t}</p>)}
      </div>
    </div>
  );
}

function SubmitBar({ disabled, resolved, label = "בדיקה" }: { disabled: boolean; resolved: boolean; label?: string }) {
  if (resolved) return null;
  return (
    <div className="mp-submit">
      <button type="submit" className="mp-btn mp-btn-primary" disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

/* ───────────── Choice ───────────── */

export function ChoiceQuestionView({ q }: { q: ComponentOf<"choiceQuestion"> }) {
  const { qs, resolved, revealCorrect, submit } = useQuestion(q);
  const name = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const options = useMemo(() => (q.shuffle ? seededShuffle(q.options, q.id) : q.options), [q]);
  const last = qs?.lastResponse?.type === "choiceQuestion" ? qs.lastResponse.optionIds : [];
  const optionFeedback = q.options.filter((o) => last.includes(o.id) && o.feedback).map((o) => o.feedback!);

  const toggle = (id: string) =>
    setSelected((s) => (q.mode === "single" ? [id] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form
      className="mp-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) submit({ type: "choiceQuestion", optionIds: selected });
      }}
    >
      <fieldset disabled={resolved}>
        <legend className="mp-prompt">{q.prompt}</legend>
        {q.mode === "multiple" && <p className="mp-hint">ניתן לבחור יותר מתשובה אחת</p>}
        <div className="mp-options">
          {options.map((o) => {
            const isSel = resolved ? last.includes(o.id) : selected.includes(o.id);
            const mark = revealCorrect && o.correct ? "correct" : resolved && isSel ? (o.correct ? "correct" : "incorrect") : "";
            return (
              <label key={o.id} className={`mp-option${isSel ? " is-selected" : ""}${mark ? ` is-${mark}` : ""}`}>
                <input
                  type={q.mode === "single" ? "radio" : "checkbox"}
                  name={name}
                  value={o.id}
                  checked={isSel}
                  onChange={() => toggle(o.id)}
                />
                <span>{o.text}</span>
                {mark === "correct" && <span className="mp-mark">✓<span className="mp-sr"> תשובה נכונה</span></span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <SubmitBar disabled={!selected.length} resolved={resolved} />
      <Feedback q={q} extra={optionFeedback} />
    </form>
  );
}

/* ───────────── True / False ───────────── */

export function TrueFalseView({ q }: { q: ComponentOf<"trueFalse"> }) {
  const { qs, resolved, revealCorrect, submit } = useQuestion(q);
  const name = useId();
  const [value, setValue] = useState<boolean | null>(null);
  const last = qs?.lastResponse?.type === "trueFalse" ? qs.lastResponse.value : null;
  const opts = [
    { v: true, label: "נכון" },
    { v: false, label: "לא נכון" },
  ];
  return (
    <form
      className="mp-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== null) submit({ type: "trueFalse", value });
      }}
    >
      <fieldset disabled={resolved}>
        <legend className="mp-prompt">{q.prompt}</legend>
        <div className="mp-options mp-options-row">
          {opts.map((o) => {
            const isSel = resolved ? last === o.v : value === o.v;
            const mark = revealCorrect && q.answer === o.v ? "correct" : resolved && isSel ? (q.answer === o.v ? "correct" : "incorrect") : "";
            return (
              <label key={String(o.v)} className={`mp-option${isSel ? " is-selected" : ""}${mark ? ` is-${mark}` : ""}`}>
                <input type="radio" name={name} checked={isSel} onChange={() => setValue(o.v)} />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <SubmitBar disabled={value === null} resolved={resolved} />
      <Feedback q={q} />
    </form>
  );
}

/* ───────────── Hotspots ───────────── */

export function HotspotView({ q }: { q: ComponentOf<"hotspotImage"> }) {
  const { resolveMedia } = usePlayer();
  const { qs, resolved, revealCorrect, submit } = useQuestion(q);
  const [selected, setSelected] = useState<string[]>([]);
  const m = resolveMedia(q.media);
  const last = qs?.lastResponse?.type === "hotspotImage" ? qs.lastResponse.hotspotIds : [];
  const shown = resolved ? last : selected;
  const toggle = (id: string) =>
    setSelected((s) => (q.mode === "single" ? [id] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fb = q.hotspots.filter((h) => last.includes(h.id) && h.feedback).map((h) => h.feedback!);

  return (
    <form
      className="mp-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) submit({ type: "hotspotImage", hotspotIds: selected });
      }}
    >
      <p className="mp-prompt" id={`${q.id}-prompt`}>{q.prompt}</p>
      {q.mode === "all" && <p className="mp-hint">סמנו את כל האזורים המתאימים</p>}
      {m ? (
        <div className="mp-hotspot-stage">
          {/* Positions are percentages of the image, so they scale on any screen. */}
          <img src={m.src} alt={q.alt} />
          {q.hotspots.map((h) => {
            const s = h.shape;
            const style: React.CSSProperties =
              s.kind === "circle"
                ? { left: `${s.cx}%`, top: `${s.cy}%`, width: `${s.r * 2}%`, aspectRatio: "1", borderRadius: "50%", transform: "translate(-50%, -50%)" }
                : { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` };
            const isSel = shown.includes(h.id);
            const mark = revealCorrect && h.correct ? "correct" : resolved && isSel ? (h.correct ? "correct" : "incorrect") : "";
            return (
              <button
                key={h.id}
                type="button"
                className={`mp-hotspot${isSel ? " is-selected" : ""}${mark ? ` is-${mark}` : ""}`}
                style={style}
                aria-pressed={isSel}
                aria-label={h.label}
                disabled={resolved}
                onClick={() => toggle(h.id)}
              />
            );
          })}
        </div>
      ) : (
        <MissingMedia />
      )}
      <SubmitBar disabled={!selected.length} resolved={resolved} />
      <Feedback q={q} extra={fb} />
    </form>
  );
}

/* ───────────── Sequence ───────────── */

export function SequenceView({ q }: { q: ComponentOf<"sequenceTask"> }) {
  const { qs, resolved, revealCorrect, submit } = useQuestion(q);
  const initial = useMemo(() => {
    let s = seededShuffle(q.items, q.id);
    // Never start in the correct order.
    if (s.every((it, i) => it.id === q.items[i]!.id)) s = [...s.slice(1), s[0]!];
    return s.map((i) => i.id);
  }, [q]);
  const [order, setOrder] = useState<string[]>(initial);
  const last = qs?.lastResponse?.type === "sequenceTask" ? qs.lastResponse.order : null;
  const shown = revealCorrect ? q.items.map((i) => i.id) : resolved && last ? last : order;
  const text = (id: string) => q.items.find((i) => i.id === id)?.text ?? "";
  const [announce, setAnnounce] = useState("");

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to]!, next[index]!];
    setOrder(next);
    setAnnounce(`"${text(next[to]!)}" הועבר למקום ${to + 1}`);
  };

  return (
    <form
      className="mp-question"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ type: "sequenceTask", order });
      }}
    >
      <p className="mp-prompt">{q.prompt}</p>
      {revealCorrect && <p className="mp-hint">זה הסדר הנכון:</p>}
      <ol className="mp-sequence">
        {shown.map((id, i) => (
          <li key={id} className="mp-seq-item">
            <span className="mp-seq-num" aria-hidden="true">{i + 1}</span>
            <span className="mp-seq-text">{text(id)}</span>
            {!resolved && (
              <span className="mp-seq-actions">
                <button type="button" className="mp-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`העברה למעלה: ${text(id)}`}>▲</button>
                <button type="button" className="mp-icon-btn" onClick={() => move(i, 1)} disabled={i === shown.length - 1} aria-label={`העברה למטה: ${text(id)}`}>▼</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mp-sr" aria-live="polite">{announce}</p>
      <SubmitBar disabled={false} resolved={resolved} />
      <Feedback q={q} />
    </form>
  );
}
