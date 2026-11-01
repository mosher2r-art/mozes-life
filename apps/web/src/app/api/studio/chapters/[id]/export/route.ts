import { exportChapter } from "@/server/chapters";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

/** Downloads the chapter in the mozes-chapter exchange format. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.view_draft");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const file = await exportChapter(id);
  if (!file) return json({ error: "not_found" }, 404);
  const name = `chapter-${id}.json`;
  return new Response(JSON.stringify(file, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
