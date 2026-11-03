import { z } from "zod";
import { can } from "@mozes/authz";
import { editAssetVersion } from "@/server/media-v2";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { AssetMetadataEdit } from "@/lib/media-v2-policy";
export const dynamic = "force-dynamic";
const Body = z.object({ expectedVersionId: z.string().regex(ID_RE), metadata: AssetMetadataEdit, review: z.enum(["approved", "rejected"]).optional() }).strict();
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params, parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid", message: "שדות המטא־דאטה אינם תקינים." }, 400);
  const g = await guard(parsed.data.review ? "medical.review" : "media.manage"); if ("response" in g) return g.response;
  if (!can(g.user.actor,"media.manage") && Object.keys(parsed.data.metadata).length) return json({error:"forbidden",message:"הרשאת סקירה רפואית אינה מאפשרת שינוי פרטי הרישיון."},403);
  const result = await editAssetVersion(g.user.actor.userId, id, parsed.data.expectedVersionId, parsed.data.metadata, parsed.data.review);
  return json(result, result.ok ? 200 : 409);
}
