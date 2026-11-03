import { z } from "zod";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";
import { listDevices, createDevice, verifyDevice } from "@/server/content-v2";
export const dynamic = "force-dynamic";
const Verify = z.object({ id: z.string().regex(ID_RE), expectedUpdatedAt: z.iso.datetime({ offset: true }), evidence: z.object({ guideReviewed: z.boolean(), trainerTested: z.boolean(), notes: z.string().trim().min(1).max(3000) }).strict() }).strict();
export async function GET() {
  const g = await guard("course.view_draft"); if ("response" in g) return g.response;
  return json({ devices: await listDevices() });
}
export async function POST(req: Request) {
  const g = await guard("media.manage"); if ("response" in g) return g.response;
  const result = await createDevice(g.user.actor.userId, await readJson(req)); return json(result, result.ok ? 201 : 422);
}
export async function PATCH(req: Request) {
  const g = await guard("medical.review"); if ("response" in g) return g.response;
  const parsed = Verify.safeParse(await readJson(req)); if (!parsed.success) return json({ error: "invalid" }, 400);
  const b = parsed.data, result = await verifyDevice(g.user.actor.userId, b.id, b.evidence, b.expectedUpdatedAt); return json(result, result.ok ? 200 : 409);
}
