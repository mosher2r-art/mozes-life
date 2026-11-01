import { z } from "zod";
import { addMember } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ email: z.string().trim().email("כתובת אימייל לא תקינה"), role: z.enum(["learner", "org_admin"]) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid", message: parsed.success ? undefined : parsed.error.issues[0]?.message }, 400);
  const r = await addMember(g.user.actor.userId, id, parsed.data.email, parsed.data.role);
  return r.ok ? json({ ok: true }) : json({ error: "rejected", message: r.message }, 422);
}
