import { z } from "zod";
import { reserveImport } from "@/server/importer";
import { guard, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ filename: z.string().min(1).max(255), size: z.number().int().positive() }).strict();

export async function POST(req: Request) {
  const g = await guard("course.import");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await reserveImport(g.user.actor.userId, parsed.data.filename, parsed.data.size);
  if (!r.ok) return json({ error: "rejected", message: r.message }, 422);
  return json({ id: r.id, upload: r.upload }, 201);
}
