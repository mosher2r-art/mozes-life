import { z } from "zod";
import { deleteChapter, saveChapter } from "@/server/chapters";
import { guard, ID_RE, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ content: z.unknown(), baseRevision: z.number().int().min(1) }).strict();

/** Autosave of the chapter document (optimistic concurrency on revision). */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.edit");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > 6_000_000) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await saveChapter(id, g.user.actor.userId, parsed.data.content, parsed.data.baseRevision);
  if (r.ok) return json({ revision: r.revision });
  if (r.reason === "not_found") return json({ error: "not_found" }, 404);
  if (r.reason === "conflict") return json({ error: "conflict", revision: r.revision }, 409);
  return json({ error: "invalid", message: r.message }, 422);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.edit");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const r = await deleteChapter(g.user.actor.userId, id);
  return r.ok ? json({ ok: true }) : json({ error: "refused", message: r.message }, 409);
}
