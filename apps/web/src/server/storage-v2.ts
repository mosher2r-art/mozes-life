import "server-only";
import { AwsClient } from "aws4fetch";
import { readFile, writeFile, mkdir, copyFile, stat, open, rm } from "node:fs/promises";
import path from "node:path";
import { driver, localPath, s3Config, serveLocal, type UploadTarget } from "./storage";
const safe = (key: string) => { if (!/^[a-z0-9][a-z0-9/_.-]{0,200}$/.test(key) || key.includes("..")) throw Error("invalid storage key"); return key; };
const file = (key: string) => localPath(`private/${safe(key)}`);
function remote(privateBucket = true) {
  const config = s3Config(); if (!config) throw Error("האחסון אינו מוגדר");
  const bucket = privateBucket ? process.env.S3_PRIVATE_BUCKET : config.bucket;
  if (!bucket || !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) throw Error("נדרש bucket פרטי ב־S3_PRIVATE_BUCKET עבור נכסי v2");
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: config.region });
  return { client, object: (key: string) => `${config.endpoint.replace(/\/+$/, "")}/${bucket}/${safe(key)}` };
}
export function privateStorageAvailable(): boolean { return driver() === "local" || !!(s3Config() && process.env.S3_PRIVATE_BUCKET); }
export async function privateUpload(key: string, mime: string, assetId: string, versionId: string): Promise<UploadTarget> {
  if (driver() === "local") return { url: `/api/studio/media/${assetId}/versions/${versionId}/content`, method: "PUT", headers: { "content-type": mime } };
  const { client, object } = remote(), url = new URL(object(key)); url.searchParams.set("X-Amz-Expires", "900");
  const request = await client.sign(new Request(url, { method: "PUT", headers: { "content-type": mime } }), { aws: { signQuery: true } });
  return { url: request.url, method: "PUT", headers: { "content-type": mime } };
}
export async function writePrivateLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
  if (driver() !== "local") throw Error("local only");
  const destination = file(key); await mkdir(path.dirname(destination), { recursive: true });
  const { Readable } = await import("node:stream"), { createWriteStream } = await import("node:fs"), { pipeline } = await import("node:stream/promises");
  let received = 0; const limited = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { received += chunk.byteLength; if (received > maxBytes) controller.error(Error("too_large")); else controller.enqueue(chunk); } }));
  try { await pipeline(Readable.fromWeb(limited as never), createWriteStream(destination)); } catch (error) { await rm(destination, { force: true }); throw error; }
}
export async function inspectPrivate(key: string): Promise<{ size: number; head: Uint8Array } | null> {
  if (driver() === "local") { try { const size = (await stat(file(key))).size, fd = await open(file(key), "r"), head = new Uint8Array(32); try { const { bytesRead } = await fd.read(head, 0, 32, 0); return { size, head: head.subarray(0, bytesRead) }; } finally { await fd.close(); } } catch { return null; } }
  const { client, object } = remote(); const response = await client.fetch(object(key), { headers: { range: "bytes=0-31" } }); if (!response.ok || !response.body) return null;
  const size = Number(response.headers.get("content-range")?.split("/")[1] ?? response.headers.get("content-length"));
  const reader = response.body.getReader(), head = new Uint8Array(32); let length = 0;
  try { while (length < 32) { const { value, done } = await reader.read(); if (done) break; const part = value.subarray(0, 32 - length); head.set(part, length); length += part.length; } } finally { await reader.cancel(); }
  return { size, head: head.subarray(0, length) };
}
export async function readPrivateBytes(key: string, maxBytes: number): Promise<Buffer> {
  if (driver() === "local") { if ((await stat(file(key))).size > maxBytes) throw Error("הקובץ גדול מדי לעיבוד"); return readFile(file(key)); }
  const { client, object } = remote(), response = await client.fetch(object(key)); if (!response.ok || !response.body) throw Error("הקובץ לא נמצא באחסון");
  const chunks: Uint8Array[] = [], reader = response.body.getReader(); let total = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > maxBytes) throw Error("הקובץ גדול מדי לעיבוד"); chunks.push(value); } } finally { await reader.cancel(); }
  return Buffer.concat(chunks, total);
}
export async function putPrivateBytes(key: string, bytes: Buffer, mime: string) {
  if (driver() === "local") { await mkdir(path.dirname(file(key)), { recursive: true }); await writeFile(file(key), bytes); return; }
  const { client, object } = remote(); const response = await client.fetch(object(key), { method: "PUT", headers: { "content-type": mime, "content-length": String(bytes.length) }, body: new Uint8Array(bytes) }); if (!response.ok) throw Error(`private storage PUT ${response.status}`);
}
export async function removePrivate(key: string) { if (driver() === "local") await rm(file(key), { force: true }); else { const { client, object } = remote(); const r = await client.fetch(object(key), { method: "DELETE" }); if (!r.ok && r.status !== 404) throw Error("מחיקת קובץ האחסון נכשלה"); } }
export async function servePrivate(key: string, mime: string, range: string | null): Promise<Response> {
  const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'none'", "cross-origin-resource-policy": "same-origin" };
  if (range && (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range) || range.length > 80)) return new Response(null, { status: 416, headers });
  if (driver() === "local") { const response = await serveLocal(`private/${safe(key)}`, mime, range); for (const [name, value] of Object.entries(headers)) response.headers.set(name, value); return response; }
  const { client, object } = remote(); const r = await client.fetch(object(key), { headers: range ? { range } : undefined });
  const responseHeaders = new Headers({ ...headers, "content-type": mime, "accept-ranges": "bytes" });
  for (const name of ["content-length", "content-range", "etag"]) { const value = r.headers.get(name); if (value) responseHeaders.set(name, value); }
  return new Response(r.body, { status: r.status, headers: responseHeaders });
}
/** Copy without mutating the original object or loading a video into Worker memory. */
export async function copyIntoPrivate(source: string, sourcePrivate: boolean, target: string, size: number, mime: string) {
  if (driver() === "local") { const sourceFile = sourcePrivate ? file(source) : localPath(source); if ((await stat(sourceFile)).size !== size) throw Error("גודל נכס המקור אינו תואם"); await mkdir(path.dirname(file(target)), { recursive: true }); await copyFile(sourceFile, file(target)); return; }
  const from = remote(sourcePrivate), to = remote(true), response = await from.client.fetch(from.object(source)); if (!response.ok || !response.body) throw Error("נכס המקור אינו זמין להעתקה");
  if (response.headers.has("content-length") && Number(response.headers.get("content-length")) !== size) { await response.body.cancel(); throw Error("גודל נכס המקור אינו תואם"); }
  let received = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { received += chunk.byteLength; if (received > size) controller.error(Error("נכס המקור גדול מהמוצהר")); else controller.enqueue(chunk); }, flush(controller) { if (received !== size) controller.error(Error("נכס המקור קצר מהמוצהר")); } }));
  const result = await to.client.fetch(to.object(target), { method: "PUT", headers: { "content-length": String(size), "content-type": mime }, body, ...({ duplex: "half" } as object) }); if (!result.ok) throw Error("לא ניתן ליצור גרסה פרטית של הנכס");
}
