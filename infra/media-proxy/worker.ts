export interface MediaEnvironment {
  SUPABASE_PUBLIC_BUCKET_URL: string;
  APP_ORIGIN: string;
}

const types: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", xml: "application/xml",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", ogg: "audio/ogg",
  wav: "audio/wav", vtt: "text/vtt; charset=utf-8", woff: "font/woff",
  woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", pdf: "application/pdf",
  wasm: "application/wasm",
};

/** Public courseware must run on a separate origin from the application.
 * Supabase intentionally serves HTML as text; this read-only Worker restores
 * the MIME types of the existing package files without changing their contents.
 * It holds no database, storage, or authentication credentials. */
export async function servePublicStorage(request: Request, env: MediaEnvironment, upstreamFetch: typeof fetch = fetch): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let key: string;
  try { key = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, ""); }
  catch { return new Response("Invalid path", { status: 400 }); }
  if (!/^(packages|image|video|audio|captions)\/[a-z0-9/_.-]{1,200}$/.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  let base: URL; let app: URL;
  try { base = new URL(env.SUPABASE_PUBLIC_BUCKET_URL); app = new URL(env.APP_ORIGIN); }
  catch { return new Response("Storage unavailable", { status: 503 }); }
  if (base.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || !/^\/storage\/v1\/object\/public\/[a-z0-9-]+\/?$/.test(base.pathname) || base.search || base.hash || base.username || base.password || app.protocol !== "https:") return new Response("Storage unavailable", { status: 503 });
  const headers = new Headers();
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  const target = `${base.href.replace(/\/$/, "")}/${key}`;
  let upstream: Response;
  try { upstream = await upstreamFetch(target, { method: request.method, headers, redirect: "manual" }); }
  catch { return new Response("Storage unavailable", { status: 502 }); }
  if (![200, 206, 304, 404].includes(upstream.status)) {
    await upstream.body?.cancel(); return new Response("Storage unavailable", { status: 502 });
  }
  const output = new Headers();
  for (const name of ["content-length", "etag", "last-modified", "cache-control", "accept-ranges", "content-range"]) {
    const value = upstream.headers.get(name); if (value) output.set(name, value);
  }
  const extension = key.split(".").pop()!.toLowerCase();
  output.set("Content-Type", upstream.status === 404 ? "text/plain" : types[extension] || upstream.headers.get("content-type") || "application/octet-stream");
  output.set("X-Content-Type-Options", "nosniff");
  output.set("Referrer-Policy", "no-referrer");
  output.set("Access-Control-Allow-Origin", "*");
  output.set("Cross-Origin-Resource-Policy", "cross-origin");
  output.set("Content-Security-Policy", `frame-ancestors 'self' ${app.origin}; object-src 'none'`);
  return new Response(request.method === "HEAD" || upstream.status === 304 ? null : upstream.body, { status: upstream.status, headers: output });
}

export default {
  fetch(request: Request, env: MediaEnvironment) { return servePublicStorage(request, env); },
};
