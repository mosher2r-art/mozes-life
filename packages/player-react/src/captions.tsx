"use client";
import { useEffect, useState } from "react";
import { parseVtt, type CaptionCue } from "@mozes/content-schema";
export function CaptionOverlay({ tracks, position }: { tracks: { src: string; label: string; default?: boolean }[]; position: number }) {
  const [selected, setSelected] = useState(() => Math.max(0, tracks.findIndex(t => t.default))), [cues, setCues] = useState<CaptionCue[]>([]), [error, setError] = useState("");
  const src = tracks[selected]?.src;
  useEffect(() => { const abort = new AbortController(); setCues([]); setError(""); if (src) void fetch(src, { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.text(); }).then(text => setCues(parseVtt(text))).catch(() => { if (!abort.signal.aborted) setError("לא ניתן לטעון את הכתוביות."); }); return () => abort.abort(); }, [src]);
  if (!tracks.length) return null;
  const text = cues.filter(c => c.start <= position && c.end > position).map(c => c.text).join("\n");
  return <div className="mp-caption-control"><label>כתוביות <select aria-label="בחירת כתוביות" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value={-1}>כבוי</option>{tracks.map((t, i) => <option key={i} value={i}>{t.label}</option>)}</select></label>{selected >= 0 && text && <div className="mp-live-caption" dir="auto">{text}</div>}{error && <p role="alert">{error}</p>}</div>;
}
