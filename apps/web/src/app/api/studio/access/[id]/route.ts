import { z } from "zod";
import { updateGrant } from "@/server/access";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.union([
  z.object({ validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).strict(),
  z.object({ revoke: z.literal(true) }).strict(),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const r = await updateGrant(g.user.actor.userId, id, parsed.data);
  return r.ok ? json({ ok: true }) : json({ error: "rejected", message: r.message }, 422);
}
