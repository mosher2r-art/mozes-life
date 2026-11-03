/** Safe plain-text WebVTT reader shared by validation and accessible audio/embed captions. */
export interface CaptionCue { start: number; end: number; text: string }
const seconds = (value: string): number => { const parts = value.split(":").map(Number); return parts.length === 3 ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]! : parts[0]! * 60 + parts[1]!; };
export function parseVtt(source: string): CaptionCue[] {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) throw new Error("קובץ הכתוביות אינו WebVTT תקין");
  const cues: CaptionCue[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
    const lines = block.split("\n"), index = lines.findIndex(line => line.includes("-->"));
    if (index < 0) continue;
    const time = /^(\d{2,}:)?\d{2}:\d{2}\.\d{3}$|^\d{2}:\d{2}\.\d{3}$/;
    const [from, rest] = lines[index]!.split(/\s+-->\s+/), to = rest?.split(/\s+/)[0];
    const valid = (value: string) => time.test(value) && value.split(":").slice(-2).every(part => Number(part) < 60);
    if (!from || !to || !valid(from) || !valid(to)) throw new Error("זמני כתוביות אינם תקינים");
    const start = seconds(from), end = seconds(to);
    if (!Number.isFinite(start) || end <= start || end > 86400) throw new Error("טווח זמן בכתוביות אינו תקין");
    if(cues.length && start < cues[cues.length-1]!.start) throw new Error("מקטעי הכתוביות אינם מסודרים לפי זמן ההתחלה");
    const content = lines.slice(index + 1).join("\n").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&rlm;/g, "\u200f").replace(/&lrm;/g, "\u200e").replace(/&amp;/g, "&").trimEnd();
    if (content.trim()) cues.push({ start, end, text: content });
    if (cues.length > 5000) throw new Error("קובץ הכתוביות מכיל יותר מדי מקטעים");
  }
  if (!cues.length) throw new Error("בקובץ הכתוביות אין מקטעי דיבור");
  return cues;
}
