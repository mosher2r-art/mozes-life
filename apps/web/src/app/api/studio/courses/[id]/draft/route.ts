import { z } from "zod";
import { saveDraft } from "@/server/studio-courses";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ content: z.unknown(), baseRevision: z.number().int().min(1) }).strict();

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.edit");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const raw = await req.text();
  if (raw.length > 2_000_000) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await saveDraft(id, g.user.actor.userId, parsed.data.content, parsed.data.baseRevision);
  if (r.ok) return json({ revision: r.revision });
  if (r.reason === "not_found") return json({ error: "not_found" }, 404);
  if (r.reason === "conflict") return json({ error: "conflict", revision: r.revision }, 409);
  return json({ error: "invalid", message: r.message }, 422);
}
