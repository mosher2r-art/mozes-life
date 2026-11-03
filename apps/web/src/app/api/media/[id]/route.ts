import { getCurrentUser } from "@/server/actor";
import { getReady } from "@/server/media";
import { ID_RE, json } from "@/server/route-guard";
import { driver, serveLocal } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Serves files for the local driver (R2 files are served by Cloudflare). Signed-in users only. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (driver() !== "local") return json({ error: "not_found" }, 404);
  if (!(await getCurrentUser())) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const a = await getReady(id);
  if (!a || a.privateStorage) return json({ error: "not_found" }, 404);
  return serveLocal(a.storageKey, a.mime, req.headers.get("range"));
}
