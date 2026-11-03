import { z } from "zod";
import { createEmbedAsset } from "@/server/media-v2";
import { guard, json, readJson } from "@/server/route-guard";
const Body = z.object({ url: z.string().max(2000), title: z.string().trim().min(1).max(200) }).strict();
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const g = await guard("media.manage"); if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req)); if (!parsed.success) return json({ error: "invalid" }, 400);
  const result = await createEmbedAsset(g.user.actor.userId, parsed.data.url, parsed.data.title); return json(result, result.ok ? 201 : 422);
}
