import { resetPassword } from "@/server/admin-users";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("users.manage_platform");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const password = ID_RE.test(id) ? await resetPassword(g.user.actor.userId, id) : null;
  return password ? json({ password }) : json({ error: "not_found" }, 404);
}
