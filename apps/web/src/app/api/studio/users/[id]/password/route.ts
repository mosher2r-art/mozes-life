import { z } from "zod";
import { resetPassword } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
/** Empty body = random password; { password } = the administrator's choice. */
const Body = z.object({ password: z.string().max(200).optional() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("users.manage_platform");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await resetPassword(g.user.actor.userId, id, parsed.data.password);
  if (r.ok) return json({ password: r.password });
  return r.reason === "invalid" ? json({ error: "invalid", message: r.message }, 422) : json({ error: "not_found" }, 404);
}
