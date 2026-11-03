import { eq } from "drizzle-orm";
import { Course } from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import { db } from "@/db";
import { chapter } from "@/db/schema";
import { documentContext } from "@/server/content-v2";
import { playable } from "@/server/media-v2";
import { contentHash } from "@/lib/content-hash";
import { guard, ID_RE, json } from "@/server/route-guard";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("course.view_draft"); if ("response" in g) return g.response;
  const { id } = await ctx.params; if (!ID_RE.test(id)) return json({ error: "not_found" }, 404);
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(chapter).where(eq(chapter.id, id)).for("share"); if (!row) return null;
    const doc = Course.parse(row.content);
    const loaded = doc.schemaVersion === 2 ? await documentContext(tx, doc, id, row.draftAssetPins ?? {}, "publish") : null;
    const validation = validateCourse(doc, loaded?.context);
    const identities=Object.fromEntries([...loaded?.versions ?? []].map(([id,v])=>[id,v.contentIdentity]));
    return { revision: row.revision, schemaVersion: doc.schemaVersion, ok: validation.ok, issues: validation.issues, reviewedScreenIds: [...loaded?.context.reviewedScreenIds ?? []],mediaFingerprint:contentHash(identities),pinnedMedia:!!Object.keys(row.draftAssetPins ?? {}).length,media:loaded ? Object.fromEntries([...loaded.versions].map(([id,v])=>[id,playable(v)])) : undefined };
  });
  return result ? json(result) : json({ error: "not_found" }, 404);
}
