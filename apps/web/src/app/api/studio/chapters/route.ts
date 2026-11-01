import { z } from "zod";
import { createChapter } from "@/server/chapters";
import { guard, json, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const Body = z.object({ title: z.string().trim().min(2, "שם הפרק קצר מדי").max(120), kind: z.enum(["lesson", "exam"]) }).strict();

export async function POST(req: Request) {
  const g = await guard("course.create");
  if ("response" in g) return g.response;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const id = await createChapter(g.user.actor.userId, parsed.data.title, parsed.data.kind);
  return json({ id }, 201);
}
