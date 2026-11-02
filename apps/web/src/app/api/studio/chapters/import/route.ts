import { z } from "zod";
import { importChapters } from "@/server/chapters";
import { guard, json } from "@/server/route-guard";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5_000_000;
const Body = z.object({ files: z.array(z.object({ name: z.string().max(200), text: z.string() }).strict()).min(1).max(20) }).strict();

/** Imports chapter files (mozes-chapter, or a mozes-course split into chapters). Files are read in the browser and sent as text. */
export async function POST(req: Request) {
  const g = await guard("course.create");
  if ("response" in g) return g.response;
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES + 1_000_000) return json({ error: "too_large", message: "הקבצים גדולים מדי (עד 5MB בסך הכול)." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return json({ error: "invalid", message: "בקשה לא תקינה." }, 400);
  if (parsed.data.files.reduce((bytes, file) => bytes + Buffer.byteLength(file.text, "utf8"), 0) > MAX_BYTES) return json({ error: "too_large", message: "הקבצים גדולים מדי (עד 5MB בסך הכול)." }, 413);
  const files = parsed.data.files.map((f) => {
    try {
      return { name: f.name, json: JSON.parse(f.text.replace(/^\uFEFF/, "")) as unknown };
    } catch {
      return { name: f.name, json: null };
    }
  });
  const results = await importChapters(g.user.actor.userId, files);
  return json({ results });
}
