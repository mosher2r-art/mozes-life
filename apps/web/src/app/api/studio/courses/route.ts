import { z } from "zod";
import { createCourse } from "@/server/studio-courses";
import { guard, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ title: z.string().trim().min(2, "שם הקורס קצר מדי").max(160) }).strict();

export async function POST(req: Request) {
  const g = await guard("course.create");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const id = await createCourse(g.user.actor.userId, parsed.data.title);
  return json({ id }, 201);
}
