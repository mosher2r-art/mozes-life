import { z } from "zod";
import { deleteAsset, setAltText } from "@/server/media";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

import { assetUsage } from "@/server/media-usage";
export const dynamic = "force-dynamic";
const Body = z.object({ altText: z.string().max(300) }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("media.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  return (await setAltText(id, parsed.data.altText, g.user.actor.userId)) ? json({ ok: true }) : json({ error: "not_found" }, 404);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("media.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const r = await deleteAsset(g.user.actor.userId, id);
  if (r.ok) return json({ ok: true });
  return json({ error: r.reason, ...(r.reason==="in_use" ? {usage:await assetUsage(id)} : {}) }, r.reason === "in_use" ? 409 : 404);
}
