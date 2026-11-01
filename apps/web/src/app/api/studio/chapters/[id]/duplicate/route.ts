import { duplicateChapter } from "@/server/chapters";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.create");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const copy = await duplicateChapter(g.user.actor.userId, id);
  return copy ? json({ id: copy }, 201) : json({ error: "not_found" }, 404);
}
