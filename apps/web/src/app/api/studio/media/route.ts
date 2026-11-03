import { z } from "zod";
import { listAssets, startUpload } from "@/server/media";
import { guard, json, readJson } from "@/server/route-guard";
import { driver } from "@/server/storage";

export const dynamic = "force-dynamic";
const Kind = z.enum(["image", "video", "audio", "captions", "animation"]);
const Body = z.object({ filename: z.string().min(1).max(255), mime: z.string().max(100), size: z.number().int().positive() }).strict();

export async function GET(req: Request) {
  const g = await guard("course.view_draft");
  if ("response" in g) return g.response;
  const k = new URL(req.url).searchParams.get("kind");
  const kind = k ? Kind.safeParse(k) : null;
  if (kind && !kind.success) return json({ error: "invalid" }, 400);
  return json({ storage: driver(), assets: await listAssets(kind?.data) });
}

export async function POST(req: Request) {
  const g = await guard("media.manage");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const r = await startUpload(g.user.actor.userId, parsed.data.filename, parsed.data.mime, parsed.data.size);
  if (!r.ok) return json({ error: "rejected", message: r.message }, 422);
  return json({ id: r.id, upload: r.upload }, 201);
}
