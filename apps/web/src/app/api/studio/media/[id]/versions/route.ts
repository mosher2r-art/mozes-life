import { z } from "zod";
import { assetHistory, completePrivateUpload, startPrivateUpload } from "@/server/media-v2";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { assetUsage } from "@/server/media-usage";
export const dynamic = "force-dynamic";
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload"), filename: z.string().min(1).max(200), mime: z.string().max(100), size: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("complete"), versionId: z.string().regex(ID_RE) }).strict(),
]);
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.view_draft"); if ("response" in g) return g.response;
  const { id } = await ctx.params; if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  // Internal object keys and uploader identifiers are not returned to the client.
  return json({ usage: await assetUsage(id), versions: (await assetHistory(id)).map(v => ({ id: v.id, versionNo: v.versionNo, filename: v.filename, mime: v.mime, sizeBytes: v.sizeBytes, metadata: v.metadata, createdAt: v.createdAt.toISOString() })) });
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("media.manage"); if ("response" in g) return g.response;
  const { id } = await ctx.params, parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const b = parsed.data, result = b.action === "upload" ? await startPrivateUpload(g.user.actor.userId, b.filename, b.mime, b.size, id) : await completePrivateUpload(g.user.actor.userId, id, b.versionId);
  return json(result, result.ok ? 200 : 422);
}
