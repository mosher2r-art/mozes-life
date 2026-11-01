import { analyseImport } from "@/server/importer";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.import");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const v = ID_RE.test(id) ? await analyseImport(g.user.actor.userId, id) : null;
  return v ? json(v) : json({ error: "not_found" }, 404);
}
