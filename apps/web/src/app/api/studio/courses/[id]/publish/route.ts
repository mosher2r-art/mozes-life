import { z } from "zod";
import { publishCourse } from "@/server/studio-courses";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ medicalConfirmed: z.boolean() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.publish");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await publishCourse(id, g.user.actor.userId, parsed.data.medicalConfirmed);
  if (r.ok) return json({ versionNo: r.versionNo });
  const status = r.reason === "not_found" ? 404 : r.reason === "unchanged" ? 409 : 422;
  return json({ error: r.reason, errors: r.errors ?? [], problems:r.problems ?? [] }, status);
}
