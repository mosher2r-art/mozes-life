import { z } from "zod";
import { setSeatLimit } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ seatLimit: z.number().int().min(1).max(100_000).nullable() }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  await setSeatLimit(g.user.actor.userId, id, parsed.data.seatLimit);
  return json({ ok: true });
}
