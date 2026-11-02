"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Component, SceneObject } from "@mozes/content-schema";
import { sceneIsComplete, sceneMatchesComplete, sceneProgress } from "@mozes/player-core";
import { usePlayer } from "./context";

export function InteractiveSceneView({ c }: { c: Extract<Component, { type: "interactiveScene" }> }) {
  const { state, dispatch } = usePlayer();
  const progress = useMemo(() => sceneProgress(c.scene, state.scenes?.[c.id]), [c.scene, state.scenes, c.id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null);
  const pointer = useRef<{ id: string; x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const complete = sceneIsComplete(c.scene, progress);
  const matched = sceneMatchesComplete(c.scene, progress);
  useEffect(() => {
    const delay = c.scene.states[progress.step]?.auto_ms;
    if (!delay || !matched || complete || state.finished) return;
    const timer = setTimeout(() => dispatch({ type: "scene_advance", componentId: c.id }), delay);
    return () => clearTimeout(timer);
  }, [c.id, c.scene, progress.step, matched, complete, state.finished, dispatch]);

  function drop(objectId: string | null, targetId: string) {
    if (!objectId || state.finished) return;
    const target = c.scene.objects.find(o => o.id === targetId && o.kind === "drop");
    if (!target || target.kind !== "drop") return;
    setFeedback(target.accept === objectId ? "התאמה נכונה." : "ההתאמה אינה נכונה. נסו שוב.");
    dispatch({ type: "scene_drop", componentId: c.id, objectId, targetId });
    setSelected(null);
  }
  function pointerEnd(e: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5;
    pointer.current = null; setGhost(null);
    if (!moved) { setSelected(start.id); return; }
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest<HTMLElement>("[data-scene-drop]")).find(el => el && root.current?.contains(el));
    if (hit?.dataset.sceneDrop) drop(start.id, hit.dataset.sceneDrop);
  }
  function style(o: SceneObject): CSSProperties {
    let opacity = o.kind === "image" ? o.opacity ?? 1 : 1;
    let duration = 0;
    for (const s of c.scene.states.slice(0, progress.step + 1)) for (const change of s.changes) if (change.id === o.id) { opacity = change.opacity; duration = change.duration ?? 0; }
    return { left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, opacity, pointerEvents: opacity === 0 ? "none" : undefined, transition: `opacity ${duration}ms ease`, fontSize: "font_size" in o ? `${(o.font_size ?? 14) / 3.9}cqw` : undefined };
  }
  return (
    <div className="mp-scene-wrap">
      <div ref={root} className="mp-interactive-scene" data-testid="interactive-scene" role="group" aria-label={c.scene.title}>
        {c.scene.objects.map(o => {
          const objectStyle = style(o);
          const hidden = objectStyle.opacity === 0;
          if (o.kind === "image") return <img key={o.id} data-scene-object={o.id} src={o.src} alt={o.alt} aria-hidden={hidden || undefined} draggable={false} className={`mp-scene-object${o.animation === "Pulse" ? " mp-scene-pulse" : ""}`} style={{ ...objectStyle, objectFit: o.fit }} />;
          if (o.kind === "button") return <button key={o.id} type="button" data-scene-object={o.id} className="mp-scene-object mp-scene-next" style={objectStyle} aria-hidden={hidden || undefined} disabled={state.finished || hidden || !matched} onClick={() => complete ? dispatch({ type: "continue" }) : dispatch({ type: "scene_advance", componentId: c.id })}>{o.text}</button>;
          if (o.kind === "drop") return <button key={o.id} type="button" data-scene-object={o.id} data-scene-drop={o.id} className={`mp-scene-object mp-scene-drop${progress.matches[o.id] ? " is-matched" : ""}`} style={objectStyle} aria-hidden={hidden || undefined} disabled={state.finished || hidden || !!progress.matches[o.id]} aria-label={`${o.text}${progress.matches[o.id] ? " — הותאם" : " — יעד גרירה"}`} onClick={() => drop(selected, o.id)}>{o.text}{progress.matches[o.id] && <span aria-hidden="true"> ✓</span>}</button>;
          const used = Object.values(progress.matches).includes(o.id);
          return <button key={o.id} type="button" data-scene-object={o.id} className={`mp-scene-object mp-scene-drag${selected === o.id ? " is-selected" : ""}${used ? " is-matched" : ""}`} style={objectStyle} aria-hidden={hidden || undefined} aria-pressed={selected === o.id} disabled={state.finished || hidden || used} onClick={e => { if (e.detail === 0) setSelected(o.id); }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { id: o.id, x: e.clientX, y: e.clientY }; }} onPointerMove={e => { if (pointer.current && Math.hypot(e.clientX - pointer.current.x, e.clientY - pointer.current.y) > 5) setGhost({ text: o.text, x: e.clientX, y: e.clientY }); }} onPointerUp={pointerEnd} onPointerCancel={() => { pointer.current = null; setGhost(null); }}>{o.text}</button>;
        })}
      </div>
      {c.scene.objects.some(o => o.kind === "drop") && <p className="mp-hint">גררו תשובה אל היעד, או בחרו תשובה ואז לחצו על היעד. אפשר גם להשתמש במקלדת.</p>}
      <p className="mp-hint" role="status">{feedback}</p>
      {ghost && <div className="mp-scene-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.text}</div>}
    </div>
  );
}
