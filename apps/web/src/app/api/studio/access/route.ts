import { z } from "zod";
import { grantAccess } from "@/server/access";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z
  .object({
    courseIds: z.array(z.string().regex(ID_RE)).min(1, "בחרו לפחות קורס אחד").max(50),
    orgId: z.string().regex(ID_RE).optional(),
    userIds: z.array(z.string().regex(ID_RE)).max(1000).optional(),
    validFrom: Date,
    validUntil: Date.nullable(),
    note: z.string().max(200).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const g = await guard("org.manage");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const r = await grantAccess(g.user.actor.userId, parsed.data);
  return r.ok ? json({ created: r.created }, 201) : json({ error: "rejected", message: r.message }, 422);
}
