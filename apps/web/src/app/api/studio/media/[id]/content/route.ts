import { MEDIA_TYPES } from "@/lib/media-policy";
import { getPending } from "@/server/media";
import { guard, ID_RE, json } from "@/server/route-guard";
import { driver, writeLocal } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Upload target for the local (development/test) storage driver only. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (driver() !== "local") return json({ error: "not_found" }, 404);
  const g = await guard("media.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id) || !req.body) return json({ error: "not_found" }, 404);
  const a = await getPending(id);
  if (!a) return json({ error: "not_found" }, 404);
  const max = MEDIA_TYPES.find((t) => t.mime === a.mime)!.maxBytes;
  try {
    await writeLocal(a.storageKey, req.body, max);
  } catch {
    return json({ error: "too_large" }, 413);
  }
  return new Response(null, { status: 200 });
}
