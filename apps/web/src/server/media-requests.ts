import "server-only";
import { desc, sql } from "drizzle-orm";
import { Course, mediaUses } from "@mozes/content-schema";
import { db } from "@/db";
import { chapter } from "@/db/schema";
import { getChapter, saveChapter } from "./chapters";
export async function mediaRequests() {
  const rows = await db.select({ id: chapter.id, title: chapter.title, content: chapter.content, revision: chapter.revision }).from(chapter).where(sql`${chapter.content}->>'schemaVersion'='2' and ${chapter.content}::text like '%"placeholder":%'`).orderBy(desc(chapter.updatedAt));
  return rows.flatMap(row => {
    const parsed = Course.safeParse(row.content); if (!parsed.success || parsed.data.schemaVersion !== 2) return [];
    return mediaUses(parsed.data).flatMap(use => "placeholder" in use.ref ? [{ chapterId: row.id, chapterTitle: row.title, revision: row.revision, screenId: use.screenId, componentId: use.componentId, path: use.path, kinds: use.kinds, ...use.ref.placeholder }] : []);
  });
}
export async function resolveMediaRequest(actorId: string, chapterId: string, requestId: string, assetId: string, revision: number) {
  const row = await getChapter(chapterId);
  if (!row || row.revision !== revision) return { ok: false as const, message: "הטיוטה השתנתה; רעננו את הבקשה." };
  if (!mediaUses(row.content).some(use => "placeholder" in use.ref && use.ref.placeholder.requestId === requestId)) return { ok: false as const, message: "בקשת המדיה אינה קיימת עוד בפרק." };
  const replace = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (Object.keys(o).length === 1 && o.placeholder && typeof o.placeholder === "object" && (o.placeholder as { requestId?: unknown }).requestId === requestId) return { assetId };
      return Object.fromEntries(Object.entries(o).map(([key, child]) => [key, replace(child)]));
    }
    return value;
  };
  const result = await saveChapter(chapterId, actorId, replace(row.content), revision);
  return result.ok ? result : { ok: false as const, message: result.message ?? "השמירה נכשלה; ייתכן שסוג הנכס אינו מתאים לבקשה." };
}
