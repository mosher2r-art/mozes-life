import { stat } from "node:fs/promises";
import { contentTypeOf } from "@/server/import/analyze";
import { driver, localPath, serveLocal } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Serves extracted packages for the LOCAL storage driver (development/tests). Reached through
 * PACKAGE_ORIGIN, a different origin from the app, so packages never share the app's cookies.
 * With R2, packages are served by Cloudflare from the bucket's public domain instead.
 */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (driver() !== "local") return new Response("Not found", { status: 404 });
  const app = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : "";
  // req.url is normalised by Next; the Host header tells which origin the browser actually used.
  const host = req.headers.get("host") ?? "";
  if (!app || host === new URL(app).host) return new Response("Not found", { status: 404 }); // never on the app origin
  const { path: parts } = await ctx.params;
  const key = `packages/${parts.join("/")}`;
  try {
    await stat(localPath(key));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const res = await serveLocal(key, contentTypeOf(key), req.headers.get("range"));
  res.headers.set("content-security-policy", `frame-ancestors 'self' ${app}`.trim());
  res.headers.delete("cache-control");
  return res;
}
