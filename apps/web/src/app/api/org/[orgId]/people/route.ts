import { z } from "zod";
import { bulkPeople } from "@/server/admin-users";
import { guardOrg, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ text: z.string().max(200_000) }).strict();

/** Org admins add people to their own organization (accounts are created when missing). */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const g = await guardOrg("org.manage_members", orgId);
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await bulkPeople(g.user.actor.userId, { text: parsed.data.text, orgId });
  return r.ok ? json({ results: r.results }) : json({ error: "rejected", message: r.message }, 422);
}
