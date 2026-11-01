import { completeUpload } from "@/server/media";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("media.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const r = await completeUpload(g.user.actor.userId, id);
  if (!r.ok) return json({ error: "rejected", message: r.message }, 422);
  return json({ asset: r.asset });
}
