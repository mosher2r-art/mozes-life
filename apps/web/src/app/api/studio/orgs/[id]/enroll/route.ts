import { z } from "zod";
import { enrollOrg } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ courseId: z.string().regex(ID_RE) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const r = await enrollOrg(g.user.actor.userId, id, parsed.data.courseId);
  return r.ok ? json({ added: r.added }) : json({ error: "rejected", message: r.message }, 422);
}
