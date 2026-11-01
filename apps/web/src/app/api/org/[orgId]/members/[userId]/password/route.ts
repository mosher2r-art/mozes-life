import { z } from "zod";
import { resetPassword } from "@/server/admin-users";
import { canManageAccount } from "@/server/org-portal";
import { guardOrg, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ password: z.string().max(200).optional() }).strict();

/** Org admins may reset passwords only for accounts that belong solely to their organization. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string; userId: string }> }) {
  const { orgId, userId } = await ctx.params;
  const g = await guardOrg("org.manage_members", orgId);
  if ("response" in g) return g.response;
  if (!ID_RE.test(userId) || userId === g.user.actor.userId) return json({ error: "invalid" }, 400);
  if (!(await canManageAccount(orgId, userId))) return json({ error: "forbidden", message: "לחשבון הזה יש שיוך נוסף, ולכן רק MOZES LIFE יכולים לאפס לו סיסמה." }, 403);
  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await resetPassword(g.user.actor.userId, userId, parsed.data.password);
  if (r.ok) return json({ password: r.password });
  return r.reason === "invalid" ? json({ error: "invalid", message: r.message }, 422) : json({ error: "not_found" }, 404);
}
