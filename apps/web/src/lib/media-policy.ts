/** What may be uploaded to the media library, and how each type is recognised. */
export type AssetKind = "image" | "video" | "audio" | "captions";

export interface MediaType {
  mime: string;
  ext: string[];
  kind: AssetKind;
  maxBytes: number;
  /** Validates the first bytes of the file (never trust the extension or the browser's MIME). */
  magic: (b: Uint8Array) => boolean;
}

const MB = 1024 * 1024;
const at = (b: Uint8Array, offset: number, sig: number[]) => sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export const MEDIA_TYPES: MediaType[] = [
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], kind: "image", maxBytes: 15 * MB, magic: (b) => at(b, 0, [0xff, 0xd8, 0xff]) },
  { mime: "image/png", ext: ["png"], kind: "image", maxBytes: 15 * MB, magic: (b) => at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: "image/webp", ext: ["webp"], kind: "image", maxBytes: 15 * MB, magic: (b) => at(b, 0, ascii("RIFF")) && at(b, 8, ascii("WEBP")) },
  { mime: "video/mp4", ext: ["mp4", "m4v"], kind: "video", maxBytes: 1024 * MB, magic: (b) => at(b, 4, ascii("ftyp")) },
  { mime: "video/webm", ext: ["webm"], kind: "video", maxBytes: 1024 * MB, magic: (b) => at(b, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  { mime: "audio/mpeg", ext: ["mp3"], kind: "audio", maxBytes: 100 * MB, magic: (b) => at(b, 0, ascii("ID3")) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  { mime: "audio/mp4", ext: ["m4a"], kind: "audio", maxBytes: 100 * MB, magic: (b) => at(b, 4, ascii("ftyp")) },
  { mime: "text/vtt", ext: ["vtt"], kind: "captions", maxBytes: 1 * MB, magic: (b) => at(b, 0, ascii("WEBVTT")) || (at(b, 0, [0xef, 0xbb, 0xbf]) && at(b, 3, ascii("WEBVTT"))) },
];

export const ACCEPT_ATTR = MEDIA_TYPES.map((t) => [t.mime, ...t.ext.map((e) => `.${e}`)].join(",")).join(",");

function storageLimit(): number {
  const configured = Number(process.env.NEXT_PUBLIC_MEDIA_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : Infinity;
}

export function maxMediaBytes(kind: AssetKind): number {
  return Math.min(storageLimit(), Math.max(...MEDIA_TYPES.filter((t) => t.kind === kind).map((t) => t.maxBytes)));
}

export type CheckResult = { ok: true; type: MediaType } | { ok: false; message: string };

/** Pre-upload check of name, declared type and size (repeated on the server). */
export function checkDeclared(filename: string, mime: string, size: number): CheckResult {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const type = MEDIA_TYPES.find((t) => t.ext.includes(ext));
  if (!type) return { ok: false, message: "סוג הקובץ אינו נתמך. אפשר להעלות JPG, PNG, WebP, MP4, WebM, MP3, M4A או כתוביות VTT." };
  if (mime && mime !== type.mime && !(type.kind === "captions" && (mime === "" || mime === "text/plain"))) {
    return { ok: false, message: "סיומת הקובץ אינה תואמת את סוגו." };
  }
  if (size <= 0) return { ok: false, message: "הקובץ ריק." };
  const limit = Math.min(type.maxBytes, storageLimit());
  if (size > limit) return { ok: false, message: `הקובץ גדול מדי. הגודל המרבי ל${KIND_LABEL[type.kind]} הוא ${Math.round(limit / MB)}MB.` };
  return { ok: true, type };
}

export const KIND_LABEL: Record<AssetKind, string> = { image: "תמונה", video: "סרטון", audio: "קובץ שמע", captions: "כתוביות" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}
