import { z } from "zod";
import { createOrg, ORG_TYPES } from "@/server/admin-users";
import { guard, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ name: z.string().trim().min(2, "שם קצר מדי").max(160), type: z.enum(ORG_TYPES) }).strict();

export async function POST(req: Request) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  return json({ id: await createOrg(g.user.actor.userId, parsed.data.name, parsed.data.type) }, 201);
}
