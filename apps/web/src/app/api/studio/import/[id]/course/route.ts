import { z } from "zod";
import { createCourseFromImport } from "@/server/importer";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ title: z.string().trim().min(2, "שם הקורס קצר מדי").max(160) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.import");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!ID_RE.test(id) || !parsed.success) return json({ error: "invalid", message: parsed.success ? undefined : parsed.error.issues[0]?.message }, 400);
  const r = await createCourseFromImport(g.user.actor.userId, id, parsed.data.title);
  return r.ok ? json({ courseId: r.courseId }, 201) : json({ error: "rejected", message: r.message }, 422);
}
