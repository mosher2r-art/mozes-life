import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AwsClient } from "aws4fetch";

/**
 * Media storage.
 * - "r2": Cloudflare R2 (S3-compatible). Browsers upload directly with short-lived signed URLs,
 *   so large videos never pass through the web server. Files are served from R2's public URL.
 * - "local": a folder on disk. ONLY for development and automated tests (MEDIA_DRIVER=local);
 *   hosting platforms such as Render wipe the disk on every restart.
 * - "none": not configured — the media library explains how to enable it.
 */
export type Driver = "r2" | "local" | "none";

export function driver(): Driver {
  if (process.env.MEDIA_DRIVER === "local") {
    if (process.env.DEPLOY_TARGET === "cloudflare") throw new Error("Local storage is unavailable on Workers; configure R2 or S3");
    return "local";
  }
  return s3Config() ? "r2" : "none";
}

// Development/test only; the comment stops the bundler from tracing the whole project.
const localDir = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.MEDIA_LOCAL_DIR ?? ".media");
const safeKey = (key: string) => {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,200}$/.test(key) || key.includes("..")) throw new Error("invalid storage key");
  return key;
};

interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}

/**
 * Any S3-compatible object storage. Cloudflare R2 (R2_* variables) or a generic provider such
 * as Supabase Storage (S3_* variables: endpoint like https://<ref>.supabase.co/storage/v1/s3,
 * public base like https://<ref>.supabase.co/storage/v1/object/public/<bucket>).
 */
export function s3Config(): S3Config | null {
  const e = process.env;
  if (e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET && e.R2_PUBLIC_BASE_URL) {
    return { endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region: "auto", accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, bucket: e.R2_BUCKET, publicBase: e.R2_PUBLIC_BASE_URL };
  }
  if (e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY && e.S3_BUCKET && e.S3_PUBLIC_BASE_URL) {
    return { endpoint: e.S3_ENDPOINT, region: e.S3_REGION || "auto", accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY, bucket: e.S3_BUCKET, publicBase: e.S3_PUBLIC_BASE_URL };
  }
  return null;
}

function r2() {
  const c = s3Config()!;
  const client = new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: c.region });
  const objectUrl = (key: string) => `${c.endpoint.replace(/\/+$/, "")}/${c.bucket}/${safeKey(key)}`;
  return { client, objectUrl, publicBase: c.publicBase.replace(/\/+$/, "") };
}

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

/** Where the browser should PUT the file. */
export async function createUpload(key: string, mime: string, assetId: string, localUploadPath?: string): Promise<UploadTarget> {
  const d = driver();
  if (d === "r2") {
    const { client, objectUrl } = r2();
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", "900"); // 15 minutes
    const signed = await client.sign(new Request(url, { method: "PUT", headers: { "content-type": mime } }), { aws: { signQuery: true } });
    return { url: signed.url, method: "PUT", headers: { "content-type": mime } };
  }
  if (d === "local") return { url: localUploadPath ?? `/api/studio/media/${assetId}/content`, method: "PUT", headers: { "content-type": mime } };
  throw new Error("media storage is not configured");
}

/** Stores a request body on disk (local driver only), enforcing the size limit while streaming. */
export async function writeLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  const file = path.join(localDir(), safeKey(key));
  await mkdir(path.dirname(file), { recursive: true });
  let size = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      size += chunk.byteLength;
      if (size > maxBytes) ctrl.error(new Error("too_large"));
      else ctrl.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body.pipeThrough(counter) as never), createWriteStream(file));
  } catch (e) {
    await rm(file, { force: true });
    throw e;
  }
  return size;
}

/** Size and first bytes of a stored object, used to verify an upload before accepting it. */
export async function inspect(key: string): Promise<{ size: number; head: Uint8Array } | null> {
  const d = driver();
  if (d === "local") {
    const file = path.join(localDir(), safeKey(key));
    try {
      const s = await stat(file);
      const fh = await open(file, "r");
      const buf = new Uint8Array(32);
      await fh.read(buf, 0, 32, 0);
      await fh.close();
      return { size: s.size, head: buf };
    } catch {
      return null;
    }
  }
  if (d === "r2") {
    const { client, objectUrl } = r2();
    const res = await client.fetch(objectUrl(key), { headers: { range: "bytes=0-31" } });
    if (!(res.status === 206 || res.status === 200)) return null;
    const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length"));
    if (!res.body) return null;
    const reader = res.body.getReader();
    const head = new Uint8Array(32);
    let length = 0;
    try {
      while (length < 32) {
        const { value, done } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 32 - length);
        head.set(part, length);
        length += part.length;
      }
    } finally { await reader.cancel(); }
    return { size: total, head: head.subarray(0, length) };
  }
  return null;
}

export async function remove(key: string): Promise<void> {
  const d = driver();
  if (d === "local") await rm(path.join(localDir(), safeKey(key)), { force: true });
  else if (d === "r2") {
    const { client, objectUrl } = r2();
    await client.fetch(objectUrl(key), { method: "DELETE" });
  }
}

/** Public URL the player uses. */
export function publicUrl(key: string, assetId: string): string {
  if (driver() === "r2") return `${r2().publicBase}/${safeKey(key)}`;
  return `/api/media/${assetId}`;
}

/** Streams a local file with HTTP range support (needed for video seeking). */
export async function serveLocal(key: string, mime: string, rangeHeader: string | null): Promise<Response> {
  const file = path.join(localDir(), safeKey(key));
  const { size } = await stat(file);
  const headers: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=3600",
  };
  const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let startB = m[1] ? Number(m[1]) : size - Number(m[2]);
    let endB = m[1] && m[2] ? Number(m[2]) : size - 1;
    startB = Math.max(0, startB);
    endB = Math.min(size - 1, endB);
    if (startB > endB) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start: startB, end: endB })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${startB}-${endB}/${size}`, "content-length": String(endB - startB + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...headers, "content-length": String(size) } });
}

/** Writes one object server-side (used when extracting imported packages). */
export async function putObject(key: string, body: NodeJS.ReadableStream | Buffer, size: number, contentType: string): Promise<void> {
  const d = driver();
  if (d === "local") {
    const file = path.join(localDir(), safeKey(key));
    await mkdir(path.dirname(file), { recursive: true });
    if (Buffer.isBuffer(body)) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(file, body);
    } else await pipeline(body as NodeJS.ReadableStream, createWriteStream(file));
    return;
  }
  if (d === "r2") {
    const { client, objectUrl } = r2();
    const res = await client.fetch(objectUrl(key), {
      method: "PUT",
      headers: { "content-type": contentType, "content-length": String(size) },
      body: Buffer.isBuffer(body) ? new Uint8Array(body) : (Readable.toWeb(body as Readable) as ReadableStream),
      // Node's fetch needs this for streamed request bodies.
      ...({ duplex: "half" } as object),
    });
    if (!res.ok) throw new Error(`storage PUT failed: ${res.status}`);
    return;
  }
  throw new Error("media storage is not configured");
}

/** Copies a stored object to a local temp file (imports are analysed from disk). */
export async function downloadToFile(key: string, dest: string, maxBytes = 500 * 1024 ** 2): Promise<void> {
  const d = driver();
  if (d === "local") {
    if ((await stat(path.join(localDir(), safeKey(key)))).size > maxBytes) throw new Error("too_large");
    const { copyFile } = await import("node:fs/promises");
    await copyFile(path.join(localDir(), safeKey(key)), dest);
    return;
  }
  if (d === "r2") {
    const { client, objectUrl } = r2();
    const res = await client.fetch(objectUrl(key));
    if (!res.ok || !res.body) throw new Error(`storage GET failed: ${res.status}`);
    let received = 0;
    const limited = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) controller.error(new Error("too_large"));
        else controller.enqueue(chunk);
      },
    }));
    await pipeline(Readable.fromWeb(limited as never), createWriteStream(dest));
    return;
  }
  throw new Error("media storage is not configured");
}

/**
 * Origin from which imported packages are served. It MUST differ from the app's origin so
 * third-party courseware can never read the learner's session or call the app's APIs.
 */
export function packageBaseUrl(): string | null {
  const d = driver();
  if (d === "r2") {
    const base = r2().publicBase;
    if (!process.env.BETTER_AUTH_URL || new URL(base).origin === new URL(process.env.BETTER_AUTH_URL).origin) {
      throw new Error("Courseware must be hosted on a different origin from the app");
    }
    return `${base}/packages`;
  }
  if (d === "local") return process.env.PACKAGE_ORIGIN ? `${process.env.PACKAGE_ORIGIN.replace(/\/+$/, "")}/pkg` : null;
  return null;
}

export const localPath = (key: string) => path.join(localDir(), safeKey(key));
