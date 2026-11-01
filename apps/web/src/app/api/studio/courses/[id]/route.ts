import { CourseUpdate, updateCourse } from "@/server/studio-courses";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";

/** Course structure and settings: title, chapter order, certificate and passing score. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.edit");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const parsed = CourseUpdate.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const r = await updateCourse(id, g.user.actor.userId, parsed.data);
  if (r.ok) return json({ revision: r.revision });
  if (r.reason === "not_found") return json({ error: "not_found" }, 404);
  if (r.reason === "conflict") return json({ error: "conflict", revision: r.revision }, 409);
  return json({ error: "invalid", message: r.message }, 422);
}
