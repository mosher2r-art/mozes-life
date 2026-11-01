import { z } from "zod";
import { enrollByEmail } from "@/server/studio-courses";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ email: z.string().trim().email("כתובת אימייל לא תקינה").max(254) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.publish");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const r = await enrollByEmail(id, g.user.actor.userId, parsed.data.email);
  if (r.ok) return json({ created: r.created }, r.created ? 201 : 200);
  return json({ error: r.reason }, r.reason === "not_found" ? 404 : 422);
}
