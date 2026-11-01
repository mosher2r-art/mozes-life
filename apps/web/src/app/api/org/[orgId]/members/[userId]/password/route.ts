import { resetPassword } from "@/server/admin-users";
import { canManageAccount } from "@/server/org-portal";
import { guardOrg, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

/** Org admins may reset passwords only for accounts that belong solely to their organization. */
export async function POST(_req: Request, ctx: { params: Promise<{ orgId: string; userId: string }> }) {
  const { orgId, userId } = await ctx.params;
  const g = await guardOrg("org.manage_members", orgId);
  if ("response" in g) return g.response;
  if (!ID_RE.test(userId) || userId === g.user.actor.userId) return json({ error: "invalid" }, 400);
  if (!(await canManageAccount(orgId, userId))) return json({ error: "forbidden", message: "לחשבון הזה יש שיוך נוסף, ולכן רק MOZES LIFE יכולים לאפס לו סיסמה." }, 403);
  const password = await resetPassword(g.user.actor.userId, userId);
  return password ? json({ password }) : json({ error: "not_found" }, 404);
}
