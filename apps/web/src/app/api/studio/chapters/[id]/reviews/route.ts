import { z } from "zod";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { reviewScreen } from "@/server/content-v2";
const Body = z.object({ screenId: z.string().regex(ID_RE), revision: z.number().int().positive(), status: z.enum(["approved", "rejected"]), note: z.string().max(2000).default(""), mediaFingerprint:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("medical.review"); if ("response" in g) return g.response;
  const { id } = await ctx.params, parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid" }, 400);
  const b = parsed.data, result = await reviewScreen(g.user.actor.userId, id, b.screenId, b.revision, b.status, b.note,b.mediaFingerprint);
  return json(result, result.ok ? 200 : 409);
}
