import type { Readable } from "node:stream";
import { fromBuffer, type ZipFile, type Entry } from "yauzl";

const MAX_JSON = 5 * 1024 ** 2, MAX_EXPANDED = 8 * 1024 ** 2;
type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);
function fail(message: string): never { throw Error(`קובץ האנימציה נדחה: ${message}`); }

/** The light Lottie player does not execute expressions. Reject them at ingestion too. */
function checkTree(value: unknown, depth = 0, count = { n: 0 }): void {
  if (depth > 80 || ++count.n > 200_000) fail("מבנה מורכב מדי");
  if (Array.isArray(value)) { for (const item of value) checkTree(item, depth + 1, count); return; }
  if (!object(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("שדה לא מורשה");
    if (key === "x" && typeof child === "string" && child.trim()) fail("ביטויי JavaScript אינם נתמכים");
    // Embedded HTML, script and external font loading are outside the supported format.
    if (["fPath", "script", "expression"].includes(key)) fail("מקור חיצוני או קוד אינו נתמך");
    checkTree(child, depth + 1, count);
  }
}
function parseJson(bytes: Buffer): JsonObject {
  if (bytes.length > MAX_JSON) fail("קובץ JSON גדול מדי");
  let parsed: unknown; try { parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")); } catch { fail("JSON אינו תקין"); }
  if (!object(parsed)) fail("נדרש מסמך Lottie");
  checkTree(parsed);
  return parsed;
}
function inlineImage(bytes: Buffer): string {
  let mime: string;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
  else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") mime = "image/webp";
  else fail("מותרות תמונות PNG, JPEG או WebP בלבד");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
function validateImageData(value: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match?.[2] || match[2].length > 4 * 1024 ** 2) fail("תמונת אנימציה חייבת להיות פנימית ובגודל מותר");
  const encoded = match[2]!, decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64") !== encoded || !inlineImage(decoded).startsWith(`data:image/${match[1]};`)) fail("תוכן תמונה לא תואם");
}
function safePath(name: string): boolean {
  return !!name && !name.startsWith("/") && !/[\\:\0]/.test(name) && !name.split("/").some(s => s === ".." || s === "." || s === "");
}
async function unzip(bytes: Buffer): Promise<Map<string, Buffer>> {
  if (bytes.length > 2 * 1024 ** 2) fail("קובץ dotLottie גדול מדי");
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, z) => error || !z ? reject(Error("ארכיון dotLottie אינו תקין")) : resolve(z)));
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>(); let entries = 0, total = 0, settled = false;
    const stop = (error: unknown) => { if (!settled) { settled = true; zip.close(); reject(error instanceof Error ? error : Error("ארכיון לא תקין")); } };
    zip.on("error", stop);
    zip.on("end", () => { if (!settled) { settled = true; resolve(files); } });
    zip.on("entry", (entry: Entry) => {
      void (async () => {
        if (++entries > 32) fail("יותר מדי קבצים בארכיון");
        const name = entry.fileName;
        if (name.endsWith("/")) { if (!safePath(name.slice(0, -1))) fail("נתיב אסור"); zip.readEntry(); return; }
        if (!safePath(name) || files.has(name) || (entry.externalFileAttributes >>> 16 & 0o170000) === 0o120000) fail("נתיב כפול או לא מורשה");
        total += entry.uncompressedSize;
        if (total > MAX_EXPANDED || entry.uncompressedSize > MAX_JSON || (entry.uncompressedSize > 100_000 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 200)) fail("נפח הארכיון חורג מהמותר");
        const stream = await new Promise<Readable>((res, rej) => zip.openReadStream(entry, (e, s) => e || !s ? rej(e ?? Error("קריאת ארכיון נכשלה")) : res(s)));
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) { size += chunk.length; if (size > entry.uncompressedSize || size > MAX_JSON) { stream.destroy(); fail("גודל רשומה לא תואם"); } chunks.push(chunk); }
        files.set(name, Buffer.concat(chunks)); zip.readEntry();
      })().catch(stop);
    });
    zip.readEntry();
  });
}

export interface NormalizedLottie { bytes: Buffer; width: number; height: number; durationMs: number }
/** Produces a self-contained JSON object: no URLs, expressions, scripts or external fonts. */
export async function normalizeLottie(input: Buffer, filename: string): Promise<NormalizedLottie> {
  let animation: JsonObject;
  if (filename.toLowerCase().endsWith(".lottie")) {
    const files = await unzip(input), manifestBytes = files.get("manifest.json");
    if (!manifestBytes) fail("חסר manifest.json");
    const manifest = parseJson(manifestBytes), animations = manifest.animations;
    if (!Array.isArray(animations) || animations.length !== 1 || !object(animations[0]) || typeof animations[0].id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(animations[0].id)) fail("נתמכת אנימציה יחידה עם מזהה תקין");
    const animationBytes = files.get(`animations/${animations[0].id}.json`) ?? files.get(`a/${animations[0].id}.json`);
    if (!animationBytes) fail("קובץ האנימציה שהוצהר אינו קיים");
    animation = parseJson(animationBytes);
    if (Array.isArray(animation.assets)) for (const asset of animation.assets) {
      if (!object(asset) || typeof asset.p !== "string" || asset.p.startsWith("data:")) continue;
      const relative = `${typeof asset.u === "string" ? asset.u : ""}${asset.p}`;
      if (!safePath(relative)) fail("נתיב תמונה לא מורשה");
      const image = files.get(relative) ?? files.get(`images/${relative}`) ?? files.get(`i/${relative}`);
      if (!image) fail("תמונה חסרה בארכיון");
      asset.p = inlineImage(image); asset.u = ""; asset.e = 1;
    }
  } else animation = parseJson(input);
  const { w, h, fr, ip, op, layers } = animation;
  if (typeof animation.v !== "string" || ![w, h].every(n => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 8192) || typeof fr !== "number" || !Number.isFinite(fr) || fr < 1 || fr > 120 || typeof ip !== "number" || !Number.isFinite(ip) || typeof op !== "number" || !Number.isFinite(op) || op <= ip || (op - ip) / fr > 600 || !Array.isArray(layers) || layers.length > 500) fail("נדרשים ממדים, קצב פריימים, משך ושכבות Lottie תקינים");
  if (animation.fonts) fail("יש להמיר טקסט לצורות; טעינת גופנים חיצונית אינה נתמכת");
  if (animation.assets !== undefined && !Array.isArray(animation.assets)) fail("רשימת נכסים לא תקינה");
  if (Array.isArray(animation.assets)) for (const asset of animation.assets) {
    if (!object(asset)) fail("נכס פנימי לא תקין");
    if (asset.p !== undefined) { if (typeof asset.p !== "string" || asset.u && asset.u !== "") fail("אין לטעון כתובות חיצוניות"); validateImageData(asset.p); }
  }
  // Reject URL-bearing fields at any level, including nested compositions.
  const inspect = (value: unknown): void => { if (Array.isArray(value)) value.forEach(inspect); else if (object(value)) for (const [key, child] of Object.entries(value)) { if (["p", "u", "url", "href"].includes(key) && typeof child === "string" && child && !child.startsWith("data:image/")) fail("משאב חיצוני אינו נתמך"); inspect(child); } };
  inspect(animation); checkTree(animation);
  const bytes = Buffer.from(JSON.stringify(animation)); if (bytes.length > MAX_EXPANDED) fail("האנימציה המנורמלת גדולה מדי");
  return { bytes, width: w as number, height: h as number, durationMs: Math.ceil((op - ip) / fr * 1000) };
}
