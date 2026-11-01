import { z } from "zod";
import { bulkPeople } from "@/server/admin-users";
import { guard, ID_RE, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z
  .object({
    text: z.string().max(200_000),
    orgId: z.string().regex(ID_RE).optional(),
    courseIds: z.array(z.string().regex(ID_RE)).max(50).optional(),
    validFrom: Date.optional(),
    validUntil: Date.nullable().optional(),
  })
  .strict()
  .refine((b) => b.orgId || !b.courseIds?.length || b.validFrom, "חסר תאריך התחלה");

export async function POST(req: Request) {
  const g = await guard("users.manage_platform");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const r = await bulkPeople(g.user.actor.userId, parsed.data);
  return r.ok ? json({ results: r.results, granted: r.granted }) : json({ error: "rejected", message: r.message }, 422);
}
