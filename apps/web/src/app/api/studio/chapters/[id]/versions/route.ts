import { z } from "zod";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { chapterHistory, publishChapter, rollbackChapter, useLatestChapterMedia } from "@/server/chapter-versions";
const Body = z.discriminatedUnion("action", [z.object({ action: z.literal("publish"), revision: z.number().int().positive() }).strict(), z.object({ action: z.literal("rollback"), revision: z.number().int().positive(), versionId: z.string().regex(ID_RE) }).strict(),z.object({action:z.literal("use_latest_media"),revision:z.number().int().positive()}).strict()]);
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.view_draft"); if ("response" in g) return g.response;
  const { id } = await ctx.params; if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  return json({ versions: await chapterHistory(id) });
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params, parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const b = parsed.data, g = await guard(b.action === "publish" ? "course.publish" : "course.edit"); if ("response" in g) return g.response;
  const result = b.action === "publish" ? await publishChapter(g.user.actor.userId, id, b.revision) : b.action==="rollback" ? await rollbackChapter(g.user.actor.userId, id, b.versionId, b.revision) : await useLatestChapterMedia(g.user.actor.userId,id,b.revision);
  return json(result, result.ok ? 200 : 409);
}
