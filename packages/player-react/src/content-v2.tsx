"use client";
import type { Screen } from "@mozes/content-schema";
import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import type { ComponentOf, MediaRef } from "@mozes/content-schema";
import { Blocks } from "./content";
import { usePlayer } from "./context";
const SoftwareSequence = lazy(() => import("./modules/SoftwareSequence"));
export function PlaceholderView({ media }: { media: MediaRef }) {
  return <div className="mp-asset-placeholder" role="note">{"placeholder" in media ? <><strong>נכס שטרם הועלה</strong><p>{media.placeholder.description}</p><small>בקשה: {media.placeholder.requestId}</small></> : "קובץ המדיה אינו זמין. יש לבדוק את הנכס בספרייה."}</div>;
}
export function ImageV2View({ c, cover = false }: { c: ComponentOf<"image">; cover?: boolean }) {
  const { resolveMedia } = usePlayer(), media = resolveMedia(c.media), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) dialog.current?.showModal(); else if (dialog.current?.open) dialog.current.close(); }, [open]);
  if (!media) return <PlaceholderView media={c.media} />;
  const credit = [...new Set(["credit" in c ? c.credit : undefined, media.creditText].filter(Boolean))].join(" · ");
  const ratio = "aspectRatio" in c && c.aspectRatio !== "auto" ? c.aspectRatio.replace(":", "/") : undefined;
  const image = <img src={media.src} alt={c.decorative ? "" : c.alt} loading="lazy" style={{ aspectRatio: ratio, objectFit: "contain" }} />;
  return <figure className={`mp-figure${cover ? " mp-cover" : ""}`}>
    {cover ? image : <button ref={trigger} type="button" className="mp-image-zoom" aria-label={`הגדלת תמונה: ${c.alt || "תמונה"}`} onClick={() => setOpen(true)}>{image}</button>}
    {c.caption && <figcaption>{c.caption}</figcaption>}{credit && <p className="mp-credit">{credit}</p>}
    <dialog ref={dialog} className="mp-image-dialog" aria-label="תמונה מוגדלת" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); trigger.current?.focus(); }}><button type="button" className="mp-btn" onClick={() => setOpen(false)}>סגירה</button><img src={media.src} alt={c.decorative ? "" : c.alt} />{credit && <p>{credit}</p>}</dialog>
  </figure>;
}
export function RevealView({ c }: { c: ComponentOf<"reveal"> }) {
  const { state, dispatch, resolveMedia } = usePlayer(), opened = state.opened?.[c.id] ?? [];
  return <section className="mp-reveal" aria-label="חשיפת פריטים">{c.items.map((item, index) => {
    const expanded = opened.includes(item.id), locked = c.mode === "sequential" && index > opened.length;
    return <div key={item.id} className="mp-reveal-item"><button type="button" aria-expanded={expanded} aria-controls={`reveal-${c.id}-${item.id}`} disabled={locked} onClick={() => dispatch({ type: "reveal_item", componentId: c.id, itemId: item.id })}>{item.title}{expanded && <span aria-hidden="true"> ✓</span>}</button><div id={`reveal-${c.id}-${item.id}`} hidden={!expanded}>{expanded && (item.content.kind === "text" ? <Blocks blocks={item.content.body} /> : (() => { const content = item.content; const media = resolveMedia(content.media); return media ? <figure><img src={media.src} alt={content.alt} loading="lazy" />{content.caption && <figcaption>{content.caption}</figcaption>}{(media.creditText || content.credit) && <p className="mp-credit">{media.creditText || content.credit}</p>}</figure> : <PlaceholderView media={content.media} />; })())}</div></div>;
  })}{c.requireAll && <p className="mp-hint">יש לפתוח את כל הפריטים כדי להמשיך.</p>}</section>;
}
export function HotspotExploreView({ c }: { c: ComponentOf<"hotspotExplore"> }) {
  const { state, dispatch, resolveMedia } = usePlayer(), media = resolveMedia(c.media), opened = state.opened?.[c.id] ?? [], [active, setActive] = useState<string | null>(null);
  if (!media) return <PlaceholderView media={c.media} />;
  const open = (id: string) => { dispatch({ type: "reveal_item", componentId: c.id, itemId: id }); setActive(id); };
  const item = c.hotspots.find(h => h.id === active);
  return <section className="mp-explore"><div className="mp-hotspot-canvas"><img src={media.src} alt={c.alt} />{c.hotspots.map(h => { const s = h.shape; const style = s.kind === "rect" ? { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` } : { left: `${s.cx}%`, top: `${s.cy}%`, width: `${s.r * 2}%`, aspectRatio: "1", transform: "translate(-50%, -50%)", borderRadius: "50%" }; return <button key={h.id} type="button" className="mp-explore-region" style={style} aria-label={h.label} aria-pressed={active === h.id} onClick={() => open(h.id)} />; })}</div><div className="mp-hotspot-alternative" aria-label="אזורים בתמונה — חלופה נגישה">{c.hotspots.map(h => <button type="button" className="mp-btn mp-btn-secondary" key={h.id} aria-pressed={active === h.id} onClick={() => open(h.id)}>{h.label}{opened.includes(h.id) ? " ✓" : ""}</button>)}</div>{item && <div className="mp-explore-detail" role="region" aria-label={item.title}><h3>{item.title}</h3><Blocks blocks={item.body} /></div>}{media.creditText && <p className="mp-credit">{media.creditText}</p>}{c.requireAll && <p className="mp-hint">נפתחו {opened.length} מתוך {c.hotspots.length} אזורים.</p>}</section>;
}
export function SimulationView({ c }: { c: ComponentOf<"simulation"> }) {
  return <Suspense fallback={<p role="status">טוענים מודול בדיקה…</p>}><SoftwareSequence c={c} /></Suspense>;
}
export function NarratedBlock({ componentId, screen, children }: { componentId: string; screen: Screen; children: ReactNode }) {
  const { course, state, resolveMedia } = usePlayer();
  if (course.schemaVersion !== 2 || !("narration" in screen) || !screen.narration || !resolveMedia(screen.narration.media)) return children;
  const cue = screen.narration.cues.find(c => c.componentId === componentId);
  const visible = !cue || state.preferences?.narrationMuted || (state.narration?.[screen.id] ?? 0) >= cue.atMs;
  return visible ? children : <div className="mp-narration-wait" aria-hidden="true" />;
}
