import { MEDIA_TYPES } from "@/lib/media-policy";
import { pendingVersion } from "@/server/media-v2";
import { guard, ID_RE, json } from "@/server/route-guard";
import { driver } from "@/server/storage";
import { writePrivateLocal } from "@/server/storage-v2";
export const dynamic = "force-dynamic";
export async function PUT(req: Request, ctx: { params: Promise<{ id: string; versionId: string }> }) {
  if (driver() !== "local") return json({ error: "not_found" }, 404);
  const g = await guard("media.manage"); if ("response" in g) return g.response;
  const { id, versionId } = await ctx.params;
  if (!ID_RE.test(id) || !ID_RE.test(versionId) || !req.body) return json({ error: "not_found" }, 404);
  const v = await pendingVersion(id, versionId), type = v && MEDIA_TYPES.find(t => t.mime === v.mime);
  if (!v || !type || v.createdBy !== g.user.actor.userId) return json({ error: "not_found" }, 404);
  try { await writePrivateLocal(v.storageKey, req.body, Math.min(type.maxBytes, v.sizeBytes)); } catch(error) { return error instanceof Error && error.message==="too_large" ? json({ error: "too_large" }, 413) : json({error:"storage_unavailable",message:"לא ניתן לכתוב לאחסון הבדיקות המקומי."},500); }
  return new Response(null, { status: 200 });
}
