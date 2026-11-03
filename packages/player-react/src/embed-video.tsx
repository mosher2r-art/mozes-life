"use client";
import { useEffect, useRef, useState } from "react";
import type { ResolvedMedia } from "./context";
import { CaptionOverlay } from "./captions";
type Embed = NonNullable<ResolvedMedia["embed"]>;
interface YouTubePlayer { getCurrentTime(): number; getDuration(): number; pauseVideo(): void; destroy(): void; getIframe(): HTMLIFrameElement }
interface YTLibrary { Player: new (element: HTMLElement, config: Record<string, unknown>) => YouTubePlayer }
interface VimeoPlayer { on(name: string, callback: (event: { seconds?: number; duration?: number }) => void): void; pause(): Promise<void>; destroy(): Promise<void>; ready(): Promise<void> }
interface VimeoLibrary { Player: new (element: HTMLElement, options: Record<string, unknown>) => VimeoPlayer }
declare global { interface Window { YT?: YTLibrary; onYouTubeIframeAPIReady?: () => void; Vimeo?: VimeoLibrary } }
let youtube: Promise<YTLibrary> | undefined, vimeo: Promise<VimeoLibrary> | undefined;
function loadYouTube(): Promise<YTLibrary> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtube) youtube = new Promise<YTLibrary>((resolve, reject) => { const previous = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { previous?.(); if (window.YT) resolve(window.YT); else reject(Error()); }; const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.onerror = () => { youtube = undefined; reject(Error()); }; document.head.append(script); });
  return youtube;
}
function loadVimeo(): Promise<VimeoLibrary> {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (!vimeo) vimeo = new Promise<VimeoLibrary>((resolve, reject) => { const script = document.createElement("script"); script.src = "https://player.vimeo.com/api/player.js"; script.onload = () => window.Vimeo ? resolve(window.Vimeo) : reject(Error()); script.onerror = () => { vimeo = undefined; reject(Error()); }; document.head.append(script); });
  return vimeo;
}
export function EmbedVideo({ embed, captions, onProgress, onEnded, onPausePoint, pauseAtMs }: { embed: Embed; captions: { src: string; label: string; default?: boolean }[]; onProgress: (percent: number) => void; onEnded: () => void; onPausePoint?: () => void; pauseAtMs?: number }) {
  const root = useRef<HTMLDivElement>(null), callbacks = useRef({ onProgress, onEnded, onPausePoint }), [position, setPosition] = useState(0), [error, setError] = useState(""); callbacks.current = { onProgress, onEnded, onPausePoint };
  useEffect(() => {
    if (!root.current) return;
    let disposed = false, paused = false, timer: ReturnType<typeof setInterval> | undefined, cleanup: (() => void) | undefined;
    const container = root.current, host = document.createElement("div"); container.append(host);
    const timeout = setTimeout(() => {if(!disposed)setError("טעינת הסרטון התעכבה. בדקו את החיבור ואת זמינות הסרטון.");},20_000);
    const progress = (time: number, duration: number, pause: () => void) => { if (disposed || !Number.isFinite(duration) || duration <= 0) return; setPosition(time); callbacks.current.onProgress(Math.min(99, time / duration * 100)); if (!paused && pauseAtMs !== undefined && time * 1000 >= pauseAtMs) { paused = true; pause(); callbacks.current.onPausePoint?.(); } };
    if (embed.provider === "youtube") void loadYouTube().then(library => {
      if (disposed) return;
      const player = new library.Player(host, { videoId: embed.videoId, host: "https://www.youtube-nocookie.com", width: "100%", height: "100%", playerVars: { playsinline: 1, hl: "he", cc_load_policy: 1, cc_lang_pref: "he", origin: location.origin }, events: { onReady: () => { clearTimeout(timeout); if(disposed)return; setError(""); player.getIframe().title = "נגן וידאו YouTube"; timer = setInterval(() => progress(player.getCurrentTime(), player.getDuration(), () => player.pauseVideo()), 500); }, onStateChange: (event: { data: number }) => { if (!disposed && event.data === 0) callbacks.current.onEnded(); }, onError: () => { if (!disposed) setError("לא ניתן להציג את הסרטון. בדקו את זמינותו ואת הרשאת ההטמעה."); } } }); cleanup = () => player.destroy();
    }).catch(() => { if (!disposed) setError("לא ניתן לטעון את נגן YouTube."); });
    else void loadVimeo().then(library => { if (disposed) return; const iframe=document.createElement("iframe");iframe.src=`https://player.vimeo.com/video/${embed.videoId}?dnt=1${embed.hash ? `&h=${embed.hash}` : ""}`;iframe.title="נגן וידאו Vimeo";iframe.allow="fullscreen; picture-in-picture";iframe.allowFullscreen=true;iframe.style.width="100%";iframe.style.height="100%";host.append(iframe);const player = new library.Player(iframe, {}); player.on("timeupdate", event => progress(event.seconds ?? 0, event.duration ?? 0, () => { void player.pause(); })); player.on("ended", () => { if (!disposed) callbacks.current.onEnded(); }); player.on("error", () => { if (!disposed) setError("לא ניתן להציג את הסרטון. בדקו את הרשאת ההטמעה."); }); void player.ready().then(()=>{clearTimeout(timeout);if(!disposed)setError("");}).catch(() => { if (!disposed) setError("נגן Vimeo אינו זמין."); }); cleanup = () => { void player.destroy(); }; }).catch(() => { if (!disposed) setError("לא ניתן לטעון את נגן Vimeo."); });
    return () => { disposed = true; clearTimeout(timeout); if (timer) clearInterval(timer); cleanup?.(); container.replaceChildren(); };
  }, [embed.provider, embed.videoId, embed.hash, pauseAtMs]);
  return <div className="mp-embed-video"><div ref={root} className="mp-embed-frame" />{error && <p role="alert">{error}</p>}<CaptionOverlay tracks={captions} position={position} /></div>;
}
