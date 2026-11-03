import { z } from "zod";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { mediaRequests, resolveMediaRequest } from "@/server/media-requests";
export const dynamic = "force-dynamic";
const Body = z.object({ chapterId: z.string().regex(ID_RE), requestId: z.string().regex(ID_RE), assetId: z.string().regex(ID_RE), revision: z.number().int().positive() }).strict();
export async function GET() { const g = await guard("course.view_draft"); if ("response" in g) return g.response; return json({ requests: await mediaRequests() }); }
export async function POST(req: Request) {
  const g = await guard("course.edit"); if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req)); if (!parsed.success) return json({ error: "invalid" }, 400);
  const b = parsed.data, result = await resolveMediaRequest(g.user.actor.userId, b.chapterId, b.requestId, b.assetId, b.revision); return json(result, result.ok ? 200 : 409);
}
