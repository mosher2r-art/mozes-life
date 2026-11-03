import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Course, upgradeDraftToV2 } from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import { db } from "@/db";
import { chapter, chapterVersion, auditLog } from "@/db/schema";
import { contentHash } from "@/lib/content-hash";
import { documentContext, type ContentTx } from "./content-v2";
import { ensurePrivateVersion } from "./media-v2";

export async function prepareChapterPublication(tx: ContentTx, row: typeof chapter.$inferSelect) {
  const doc = Course.parse(row.content);
  if (doc.schemaVersion !== 2) return { ok: false as const, errors: [`יש לשמור את הפרק ״${row.title}״ ב־v2 לפני פרסום גרסה עצמאית.`] };
  const loaded = await documentContext(tx, doc, row.id, row.draftAssetPins ?? {}, "publish"), validation = validateCourse(doc, loaded.context);
  if (!validation.ok) return { ok: false as const, errors: validation.issues.filter(i => i.severity === "error").map(i => `${i.message}${i.path ? ` (${i.path})` : ""}`), issues: validation.issues };
  const manifest: Record<string,string> = {};
  for (const [assetId, version] of loaded.versions) manifest[assetId] = version.id;
  return { ok: true as const, doc, manifest, versions:loaded.versions, reviewedScreenIds: loaded.context.reviewedScreenIds ?? new Set<string>(), assets: loaded.context.assets ?? {}, devices: loaded.context.devices ?? {} };
}
export async function recordChapterPublication(tx: ContentTx, row: typeof chapter.$inferSelect, actorId: string, doc: Course, manifest: Record<string,string>) {
  const hash = contentHash(doc), [latest] = await tx.select().from(chapterVersion).where(eq(chapterVersion.chapterId, row.id)).orderBy(desc(chapterVersion.versionNo)).limit(1);
  if (latest?.contentHash === hash && contentHash(latest.assetManifest) === contentHash(manifest)) return latest;
  const versionId = randomUUID(), versionNo = (latest?.versionNo ?? 0) + 1;
  const [version] = await tx.insert(chapterVersion).values({ id: versionId, chapterId: row.id, versionNo, content: doc, contentHash: hash, assetManifest: manifest, publishedBy: actorId }).returning();
  await tx.update(chapter).set({ publishedVersionId: versionId }).where(eq(chapter.id, row.id));
  await tx.insert(auditLog).values({ actorId, action: "chapter.publish", entity: "chapter", entityId: row.id, details: { versionId, versionNo } });
  return version!;
}
export async function publishChapter(actorId: string, chapterId: string, revision: number) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(chapter).where(eq(chapter.id, chapterId)).for("update");
    if (!row || row.revision !== revision) return { ok: false as const, errors: ["הטיוטה השתנתה; רעננו לפני הפרסום."] };
    const prepared = await prepareChapterPublication(tx, row); if (!prepared.ok) return prepared;
    const manifest:Record<string,string>={};for(const [id,version] of prepared.versions)manifest[id]=(await ensurePrivateVersion(tx,actorId,version)).id;
    const version = await recordChapterPublication(tx, row, actorId, prepared.doc, manifest);
    return { ok: true as const, versionNo: version.versionNo };
  });
}
export async function chapterHistory(chapterId: string) {
  return db.select({ id: chapterVersion.id, versionNo: chapterVersion.versionNo, publishedAt: chapterVersion.publishedAt, contentHash: chapterVersion.contentHash }).from(chapterVersion).where(eq(chapterVersion.chapterId, chapterId)).orderBy(desc(chapterVersion.versionNo));
}
export async function rollbackChapter(actorId: string, chapterId: string, versionId: string, expectedRevision: number) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(chapter).where(eq(chapter.id, chapterId)).for("update");
    if (!row || row.revision !== expectedRevision) return { ok: false as const, message: "הטיוטה השתנתה; רעננו לפני שחזור." };
    const [version] = await tx.select().from(chapterVersion).where(and(eq(chapterVersion.id, versionId), eq(chapterVersion.chapterId, chapterId)));
    if (!version) return { ok: false as const, message: "הגרסה לשחזור לא נמצאה בפרק." };
    const doc = upgradeDraftToV2(Course.parse(version.content)), revision = row.revision + 1;
    await tx.update(chapter).set({ content: doc, title: doc.title, kind: doc.units[0]!.kind, revision, draftAssetPins: version.assetManifest, updatedBy: actorId }).where(eq(chapter.id, chapterId));
    await tx.insert(auditLog).values({ actorId, action: "chapter.rollback.draft", entity: "chapter", entityId: chapterId, details: { fromVersionId: versionId, revision } });
    return { ok: true as const, revision };
  });
}
export async function useLatestChapterMedia(actorId:string,chapterId:string,expectedRevision:number){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(chapter).where(eq(chapter.id,chapterId)).for("update");
    if(!row || row.revision!==expectedRevision)return {ok:false as const,message:"הטיוטה השתנתה; רעננו לפני עדכון המדיה."};
    const revision=row.revision+1;
    await tx.update(chapter).set({draftAssetPins:null,revision,updatedBy:actorId}).where(eq(chapter.id,chapterId));
    await tx.insert(auditLog).values({actorId,action:"chapter.media.use_latest",entity:"chapter",entityId:chapterId,details:{revision}});
    return {ok:true as const,revision};
  });
}
