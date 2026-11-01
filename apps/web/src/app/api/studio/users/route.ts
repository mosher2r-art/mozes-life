import { z } from "zod";
import { createUser } from "@/server/admin-users";
import { guard, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z
  .object({
    name: z.string().trim().min(2, "שם קצר מדי").max(120),
    email: z.string().trim().email("כתובת אימייל לא תקינה").max(254),
    password: z.string().max(128).optional(),
    roles: z.array(z.string()).max(4),
    orgId: z.string().max(64).optional(),
    orgRole: z.string().max(20).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const g = await guard("users.manage_platform");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const r = await createUser(g.user.actor.userId, parsed.data);
  return r.ok ? json({ id: r.id, password: r.password }, 201) : json({ error: "rejected", message: r.message }, 422);
}
