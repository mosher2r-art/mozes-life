import { removeMember } from "@/server/admin-users";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const { id, userId } = await ctx.params;
  if (!ID_RE.test(id) || !ID_RE.test(userId)) return json({ error: "invalid" }, 400);
  await removeMember(g.user.actor.userId, id, userId);
  return json({ ok: true });
}
