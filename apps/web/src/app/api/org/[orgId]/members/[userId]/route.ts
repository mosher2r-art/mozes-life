import { removeMember } from "@/server/admin-users";
import { guardOrg, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ orgId: string; userId: string }> }) {
  const { orgId, userId } = await ctx.params;
  const g = await guardOrg("org.manage_members", orgId);
  if ("response" in g) return g.response;
  if (!ID_RE.test(userId)) return json({ error: "invalid" }, 400);
  if (userId === g.user.actor.userId) return json({ error: "rejected", message: "אי אפשר להסיר את עצמך מהארגון." }, 422);
  await removeMember(g.user.actor.userId, orgId, userId);
  return json({ ok: true });
}
