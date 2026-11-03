"use client";
import { useEffect, useRef, useState } from "react";
import { type ComponentOf, type CaptionTrack } from "@mozes/content-schema";
import { usePlayer } from "./context";
import { PlaceholderView } from "./content-v2";
import { EmbedVideo } from "./embed-video";
export function VideoV2View({ c, cover = false, onPausePoint }: { c: ComponentOf<"video">; cover?: boolean; onPausePoint?: () => void }) {
  const { resolveMedia, dispatch } = usePlayer(), ref = useRef<HTMLVideoElement>(null), last = useRef(0), paused = useRef(false), [failed,setFailed]=useState(false);
  const media = resolveMedia(c.media), poster = c.poster ? resolveMedia(c.poster) : null;
  const tracks: CaptionTrack[] = !c.captions ? [] : Array.isArray(c.captions) ? c.captions : [{ media: c.captions, label: "עברית", language: "he", default: true }];
  const captions = tracks.flatMap(t => { const m = resolveMedia(t.media); return m ? [{ ...t, src: m.src }] : []; });
  useEffect(() => { last.current = 0; paused.current = false;setFailed(false); }, [c.id,media?.src]);
  const progress = (percent: number) => { const bounded = Math.min(99, percent); if (bounded - last.current >= 5 || bounded >= 99) { last.current = bounded; dispatch({ type: "media_progress", componentId: c.id, percent: bounded }); } };
  const ended = () => { dispatch({ type: "media_progress", componentId: c.id, percent: 100 }); onPausePoint?.(); };
  if (!media) return <PlaceholderView media={c.media} />;
  return <figure className={`mp-figure mp-video${cover ? " mp-cover" : ""}`}>
    {c.poster && !poster && <PlaceholderView media={c.poster} />}
    {tracks.filter(t => !resolveMedia(t.media)).map((t, i) => <PlaceholderView key={i} media={t.media} />)}
    {media.embed ? <EmbedVideo embed={media.embed} captions={captions} onProgress={progress} onEnded={ended} pauseAtMs={c.pauseAtMs} onPausePoint={onPausePoint} /> : <video ref={ref} onError={()=>setFailed(true)} controls playsInline preload="metadata" poster={poster?.src} onTimeUpdate={() => { const video = ref.current; if (!video || !Number.isFinite(video.duration) || !video.duration) return; progress(video.currentTime / video.duration * 100); if (!paused.current && c.pauseAtMs !== undefined && video.currentTime * 1000 >= c.pauseAtMs) { paused.current = true; video.pause(); onPausePoint?.(); } }} onEnded={ended}><source src={media.src} type={media.mime} />{captions.map((t, i) => <track key={i} kind="captions" src={t.src} srcLang={t.language} label={t.label} default={t.default} />)}</video>}
    {failed && <p role="alert">לא ניתן לנגן את הסרטון בדפדפן הזה. בדקו את החיבור ואת קידוד הקובץ; מומלץ MP4 בקידוד H.264. הסרטון לא סומן כהושלם.</p>}
    {c.requiredWatchPercent > 0 && <p className="mp-hint">{c.requiredWatchPercent === 100 ? "יש לצפות בסרטון עד הסוף כדי להמשיך." : `נדרשת צפייה של ${c.requiredWatchPercent}% מהסרטון.`}</p>}
    {c.transcript && <details className="mp-transcript"><summary>תמליל</summary><p>{c.transcript}</p></details>}
    {media.creditText && <p className="mp-credit">{media.creditText}</p>}
  </figure>;
}
export function AudioV2View({ c }: { c: ComponentOf<"audio"> }) {
  const { resolveMedia, dispatch } = usePlayer(), ref = useRef<HTMLAudioElement>(null), [blocked, setBlocked] = useState(false), [failed,setFailed]=useState(false), media = resolveMedia(c.media);
  const autoplay = "autoplay" in c && c.autoplay;
  useEffect(() => { if (autoplay) void ref.current?.play().catch(() => setBlocked(true)); }, [c.id, autoplay, media?.src]);
  if (!media) return <PlaceholderView media={c.media} />;
  return <figure className="mp-figure mp-audio"><audio ref={ref} onError={()=>setFailed(true)} controls preload="metadata" src={media.src} onEnded={() => dispatch({ type: "media_progress", componentId: c.id, percent: 100 })} />{blocked && <p className="mp-hint">לחצו על הפעלה כדי לשמוע את ההקלטה.</p>}{failed && <p role="alert">לא ניתן לנגן את ההקלטה בדפדפן הזה. בדקו את החיבור ואת קידוד הקובץ. התמליל זמין לקריאה.</p>}<details className="mp-transcript"><summary>תמליל</summary><p>{c.transcript}</p></details>{media.creditText && <p className="mp-credit">{media.creditText}</p>}</figure>;
}
