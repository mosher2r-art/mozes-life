"use client";
import { useEffect, useRef, useState } from "react";
import type { ComponentOf, Screen } from "@mozes/content-schema";
import type { AnimationItem } from "lottie-web";
import { usePlayer } from "./context";
import { PlaceholderView } from "./content-v2";
import { CaptionOverlay } from "./captions";

export function AnimationView({ c }: { c: ComponentOf<"animation"> }) {
  const { resolveMedia } = usePlayer(), media = resolveMedia(c.media), container = useRef<HTMLDivElement>(null), animation = useRef<AnimationItem | null>(null), video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false), [error, setError] = useState(""), [reduced, setReduced] = useState(false);
  const reducedRef = useRef(false);
  useEffect(() => { const query = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => { reducedRef.current = query.matches; setReduced(query.matches); if (query.matches) { animation.current?.goToAndStop(0, true); video.current?.pause(); setPlaying(false); } }; update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  useEffect(() => {
    if (!media || media.mime?.startsWith("video/")) return;
    let disposed = false; const abort = new AbortController();
    void Promise.all([fetch(media.src, { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }), import("lottie-web/build/player/lottie_light")]).then(([data, library]) => {
      if (disposed || !container.current) return;
      const item = library.default.loadAnimation({ container: container.current, renderer: "svg", loop: c.loop, autoplay: c.playOn === "enter" && !reducedRef.current, animationData: data }); animation.current = item;
      item.addEventListener("data_failed", () => setError("לא ניתן להפעיל את קובץ האנימציה."));
      item.addEventListener("complete", () => setPlaying(false));
      item.addEventListener("DOMLoaded", () => { if (reducedRef.current) item.goToAndStop(0, true); });
      setPlaying(c.playOn === "enter" && !reducedRef.current);
    }).catch(() => { if (!disposed) setError("האנימציה אינה זמינה. נסו לטעון שוב את המסך."); });
    return () => { disposed = true; abort.abort(); animation.current?.destroy(); animation.current = null; };
  }, [media?.src, media?.mime, c.id, c.loop, c.playOn]);
  if (!media) return <PlaceholderView media={c.media} />;
  const toggle = () => { if (reducedRef.current) return; if (media.mime?.startsWith("video/")) { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setError("הדפדפן לא אפשר הפעלה.")); } else if (playing) animation.current?.pause(); else if(animation.current && animation.current.currentFrame >= animation.current.totalFrames-1) animation.current.goToAndPlay(0,true); else animation.current?.play(); setPlaying(!playing); };
  return <figure className="mp-animation" aria-label={c.alt}>{media.mime?.startsWith("video/") ? <video ref={video} src={media.src} muted playsInline loop={c.loop} onLoadedData={() => { if (c.playOn === "enter" && !reducedRef.current) void video.current?.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }} aria-label={c.alt} onEnded={() => setPlaying(false)} /> : <div ref={container} role="img" aria-label={c.alt} />}<figcaption>{c.alt}</figcaption>{reduced ? <p className="mp-hint">הנפשה נעצרה בהתאם להגדרת הפחתת תנועה במכשיר.</p> : <button type="button" className="mp-btn mp-btn-secondary" onClick={toggle} disabled={!!error}>{playing ? "עצירת הנפשה" : "הפעלת הנפשה"}</button>}{error && <p role="alert">{error}</p>}{media.creditText && <p className="mp-credit">{media.creditText}</p>}</figure>;
}

export function NarrationView({ screen }: { screen: Screen }) {
  const { state, dispatch, resolveMedia } = usePlayer(), audio = useRef<HTMLAudioElement>(null), last = useRef(0), [blocked, setBlocked] = useState(false), [failed,setFailed]=useState(false), [position, setPosition] = useState(0);
  const narration = "narration" in screen ? screen.narration : undefined, media = narration ? resolveMedia(narration.media) : null, captions = narration?.captions ? resolveMedia(narration.captions) : null;
  const muted = state.preferences?.narrationMuted === true;
  useEffect(() => { if (muted) audio.current?.pause(); else if (narration?.autoplay) void audio.current?.play().catch(() => setBlocked(true)); }, [screen.id, muted, narration?.autoplay, media?.src]);
  if (!narration) return null;
  if (!media) return <PlaceholderView media={narration.media} />;
  return <section className="mp-narration" aria-label="קריינות המסך"><label><input type="checkbox" checked={muted} onChange={e => dispatch({ type: "narration_mute", muted: e.target.checked })} />השתקת קריינות בקורס</label><button type="button" className="mp-btn mp-btn-secondary" disabled={muted} onClick={()=>{if(audio.current)void audio.current.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true));}}>הפעלת קריינות</button><audio ref={audio} onError={()=>setFailed(true)} src={media.src} controls preload="metadata" onLoadedMetadata={() => { if (audio.current && Number.isFinite(audio.current.duration)) audio.current.currentTime = Math.min((state.narration?.[screen.id] ?? 0) / 1000, audio.current.duration); }} onTimeUpdate={() => { const ms = Math.round((audio.current?.currentTime ?? 0) * 1000); setPosition(ms / 1000); if (ms - last.current > 400 || narration.cues.some(c => c.atMs > last.current && c.atMs <= ms)) { last.current = ms; dispatch({ type: "narration_progress", positionMs: ms }); } }} onEnded={() => dispatch({ type: "narration_show_all" })}>{captions && <track kind="captions" src={captions.src} srcLang="he" label="עברית" default />}</audio>{narration.captions && !captions && <PlaceholderView media={narration.captions} />}{captions && <CaptionOverlay tracks={[{ src: captions.src, label: "עברית", default: true }]} position={position} />}{failed && <p role="alert">לא ניתן לנגן את הקריינות בדפדפן הזה. אפשר להציג את כל התוכן ללא המתנה לקריינות.</p>}{blocked && <p className="mp-hint">הדפדפן דורש לחיצה על הפעלה כדי להתחיל את הקריינות.</p>}<button type="button" className="mp-btn" onClick={() => dispatch({ type: "narration_show_all" })}>הצגת כל התוכן ללא המתנה לקריינות</button></section>;
}
