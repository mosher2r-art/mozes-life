"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Component, type Course, type Screen, TEMPLATES, flattenScreens, isQuestion, screenComponents } from "@mozes/content-schema";
import {
  EngineError,
  type PlayerEvent,
  type PlayerState,
  canContinue,
  reconcile,
  resolveTarget,
  start,
  step,
  summarize,
} from "@mozes/player-core";
import { AudioView, CalloutView, HeadingView, ImageView, RichTextView, VideoView } from "./content";
import { type MediaResolver, PlayerContext, usePlayer } from "./context";
import { ChoiceQuestionView, HotspotView, SequenceView, TrueFalseView } from "./questions";

/* ───────────── Component dispatch ───────────── */

function ButtonView({ c }: { c: Extract<Component, { type: "button" }> }) {
  const { course, state, dispatch } = usePlayer();
  return (
    <button type="button" className="mp-btn mp-btn-secondary" disabled={!canContinue(course, state)} onClick={() => dispatch({ type: "button", componentId: c.id })}>
      {c.label}
    </button>
  );
}

export function ComponentView({ c, cover }: { c: Component; cover?: boolean }) {
  switch (c.type) {
    case "heading":
      return <HeadingView c={c} />;
    case "richText":
      return <RichTextView c={c} />;
    case "callout":
      return <CalloutView c={c} />;
    case "image":
      return <ImageView c={c} cover={cover} />;
    case "video":
      return <VideoView c={c} cover={cover} />;
    case "audio":
      return <AudioView c={c} />;
    case "button":
      return <ButtonView c={c} />;
    case "choiceQuestion":
      return <ChoiceQuestionView q={c} />;
    case "trueFalse":
      return <TrueFalseView q={c} />;
    case "hotspotImage":
      return <HotspotView q={c} />;
    case "sequenceTask":
      return <SequenceView q={c} />;
  }
}

function Slot({ screen, id, className, cover }: { screen: Screen; id: string; className?: string; cover?: boolean }) {
  const items = screen.slots[id] ?? [];
  if (!items.length) return null;
  return (
    <div className={`mp-slot mp-slot-${id}${className ? ` ${className}` : ""}`}>
      {items.map((c) => (
        <ComponentView key={c.id} c={c} cover={cover} />
      ))}
    </div>
  );
}

/* ───────────── Templates ───────────── */

function ScenarioScreen({ screen }: { screen: Screen }) {
  const { revealed, reveal, state } = usePlayer();
  const media = screen.slots.media?.[0];
  const decision = screen.slots.decision?.[0];
  // Images reveal immediately; videos reveal at their pause point or at the end.
  const alreadyAnswered = !!(decision && state.questions[decision.id]);
  const show = revealed || alreadyAnswered || media?.type !== "video";
  return (
    <div className="mp-tpl mp-tpl-scenario">
      {media?.type === "video" ? <VideoView c={media} onPausePoint={reveal} /> : media && <ComponentView c={media} />}
      <Slot screen={screen} id="intro" />
      {show ? (
        <Slot screen={screen} id="decision" />
      ) : (
        <p className="mp-hint" role="status">צפו בסרטון. השאלה תופיע בהמשך.</p>
      )}
    </div>
  );
}

function SummaryScreen({ screen }: { screen: Screen }) {
  const { course, state } = usePlayer();
  const s = summarize(course, state);
  return (
    <div className="mp-tpl mp-tpl-summary">
      <Slot screen={screen} id="body" />
      {s.possible > 0 && (
        <div className="mp-score" role="status">
          <span className="mp-score-value">{s.scorePercent}%</span>
          <span className="mp-score-label">
            ציון: {s.earned} מתוך {s.possible} נקודות
          </span>
        </div>
      )}
    </div>
  );
}

function ScreenBody({ screen }: { screen: Screen }) {
  switch (screen.template) {
    case "cinematic_intro":
      return (
        <div className="mp-tpl mp-tpl-cinematic">
          <Slot screen={screen} id="background" className="mp-cinematic-bg" cover />
          <div className="mp-cinematic-content">
            <Slot screen={screen} id="title" />
            <Slot screen={screen} id="body" />
            <Slot screen={screen} id="action" />
          </div>
        </div>
      );
    case "media_text":
      return (
        <div className="mp-tpl mp-tpl-media-text">
          <Slot screen={screen} id="media" />
          <Slot screen={screen} id="body" />
        </div>
      );
    case "scenario":
      return <ScenarioScreen screen={screen} />;
    case "summary":
      return <SummaryScreen screen={screen} />;
    default:
      return (
        <div className={`mp-tpl mp-tpl-${screen.template}`}>
          {TEMPLATES[screen.template].slots.map((s) => (
            <Slot key={s.id} screen={screen} id={s.id} />
          ))}
        </div>
      );
  }
}

/* ───────────── Shell ───────────── */

export interface CoursePlayerProps {
  course: Course;
  resolveMedia: MediaResolver;
  initialState?: PlayerState;
  /** Called after every successful state change (persist progress here). */
  onStateChange?: (state: PlayerState) => void;
  /** Called when an event is rejected by the engine (should not happen in normal use). */
  onError?: (error: unknown) => void;
}

const STATUS_TEXT = { passed: "עברת את הקורס", failed: "לא הגעת לציון המעבר", completed: "סיימת את הקורס", in_progress: "" } as const;

export function CoursePlayer({ course, resolveMedia, initialState, onStateChange, onError }: CoursePlayerProps) {
  const [state, setState] = useState<PlayerState>(() => (initialState ? reconcile(course, initialState) : start(course)));
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const flat = useMemo(() => flattenScreens(course), [course]);
  const ref = flat.find((r) => r.screen.id === state.currentScreenId)!;
  const screen = ref.screen;

  // Keep the latest state in a ref so dispatch stays side-effect free inside React updaters.
  const stateRef = useRef(state);
  const dispatch = useCallback(
    (event: PlayerEvent) => {
      try {
        const next = step(course, stateRef.current, event);
        setError(null);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        onStateChange?.(next);
      } catch (e) {
        onError?.(e);
        setError(e instanceof EngineError && e.code === "SCREEN_INCOMPLETE" ? "יש להשלים את המסך לפני שממשיכים" : "הפעולה לא בוצעה");
      }
    },
    [course, onStateChange, onError],
  );

  // Move focus to the new screen's title for keyboard and screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [state.currentScreenId, state.finished]);

  const summary = summarize(course, state);
  const ready = canContinue(course, state);
  // Label reflects where "continue" actually leads (branching can jump back into the course).
  const target = state.finished ? null : resolveTarget(course, state);
  const willFinish = target?.kind === "end" || (target?.kind === "next" && ref.index === flat.length - 1);
  const hasQuestions = screenComponents(screen).some(isQuestion);
  const pendingReason = !ready && !state.finished ? (hasQuestions ? "יש לענות על השאלה כדי להמשיך" : "יש לצפות בסרטון כדי להמשיך") : null;

  const ctx = {
    course,
    state,
    dispatch,
    resolveMedia,
    revealed: revealedFor === screen.id,
    reveal: () => setRevealedFor(screen.id),
  };

  return (
    <PlayerContext.Provider value={ctx}>
      <div className="mp-player" dir="rtl" lang="he">
        <header className="mp-topbar">
          <div className="mp-topbar-text">
            <span className="mp-course-title">{course.title}</span>
            <span className="mp-unit-title">{ref.unit.title}</span>
          </div>
          <div
            className="mp-progress"
            role="progressbar"
            aria-label="התקדמות בקורס"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.progressPercent}
          >
            <div className="mp-progress-bar" style={{ width: `${summary.progressPercent}%` }} />
          </div>
        </header>

        <section className="mp-screen" aria-labelledby="mp-screen-title">
          <h1 id="mp-screen-title" ref={titleRef} tabIndex={-1} className={screen.template === "cinematic_intro" ? "mp-sr" : "mp-screen-title"}>
            {screen.title}
          </h1>
          <ScreenBody key={screen.id} screen={screen} />
          {state.finished && (
            <div className={`mp-result mp-result-${summary.status}`} role="status">
              {STATUS_TEXT[summary.status] || "הגעת לסוף הקורס"}
              {summary.incompleteRequired.length > 0 && <span> · יש מסכי חובה שלא הושלמו</span>}
            </div>
          )}
        </section>

        <footer className="mp-nav">
          <button type="button" className="mp-btn mp-btn-ghost" onClick={() => dispatch({ type: "back" })} disabled={!state.history.length}>
            הקודם
          </button>
          <div className="mp-nav-status" aria-live="polite">
            {error ?? pendingReason}
          </div>
          {!state.finished && (
            <button type="button" className="mp-btn mp-btn-primary" onClick={() => dispatch({ type: "continue" })} disabled={!ready}>
              {willFinish ? "סיום" : "המשך"}
            </button>
          )}
        </footer>
      </div>
    </PlayerContext.Provider>
  );
}
