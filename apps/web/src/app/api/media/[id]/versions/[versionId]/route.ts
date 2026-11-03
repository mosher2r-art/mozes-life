import { can } from "@mozes/authz";
import { getCurrentUser } from "@/server/actor";
import { ID_RE, json } from "@/server/route-guard";
import { readAuthorizedVersion } from "@/server/media-v2";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string; versionId: string }> }) {
  const user = await getCurrentUser(); if (!user) return json({ error: "unauthenticated" }, 401);
  const { id, versionId } = await ctx.params;
  if (!ID_RE.test(id) || !ID_RE.test(versionId)) return json({ error: "not_found" }, 404);
  return readAuthorizedVersion(id, versionId, user.actor.userId, can(user.actor, "course.view_draft"), new URL(req.url).searchParams.get("enrollment"), req.headers.get("range"));
}
