import { z } from "zod";
import { setRoles } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ roles: z.array(z.string()).max(4) }).strict();

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("users.manage_platform");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const r = await setRoles(g.user.actor.userId, id, parsed.data.roles);
  return r.ok ? json({ ok: true }) : json({ error: "rejected", message: r.message }, 422);
}
