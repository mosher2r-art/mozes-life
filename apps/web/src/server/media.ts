import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { asset, assetVersion, auditLog, chapter, chapterVersion, courseDraft, courseVersion } from "@/db/schema";
import { MEDIA_TYPES, type AssetKind } from "@/lib/media-policy";
import { inspect, publicUrl, remove, type UploadTarget } from "./storage";

import { startPrivateUpload, completePrivateUpload, listPrivateAssets, editAssetVersion } from "./media-v2";
import { removePrivate } from "./storage-v2";

export interface AssetView {
  id: string;
  kind: AssetKind;
  filename: string;
  mime: string;
  sizeBytes: number;
  altText: string;
  url: string;
  createdAt: string;
}

const view = (a: typeof asset.$inferSelect): AssetView => ({
  id: a.id,
  kind: a.kind,
  filename: a.filename,
  mime: a.mime,
  sizeBytes: a.sizeBytes,
  altText: a.altText,
  url: publicUrl(a.storageKey, a.id),
  createdAt: a.createdAt.toISOString(),
});

export type CreateResult = { ok: true; id: string; upload: UploadTarget } | { ok: false; message: string };

export async function startUpload(actorId: string, filename: string, mime: string, size: number): Promise<CreateResult> {
  return startPrivateUpload(actorId, filename, mime, size);
}

export async function getPending(id: string) {
  const [a] = await db.select().from(asset).where(and(eq(asset.id, id), eq(asset.status, "pending")));
  return a ?? null;
}

/** Verifies the stored bytes (size + magic signature) before the file becomes usable. */
export async function completeUpload(actorId: string, id: string): Promise<{ ok: true; asset: AssetView } | { ok: false; message: string }> {
  const a = await getPending(id);
  if (!a) return { ok: false, message: "ההעלאה לא נמצאה." };
  if (a.privateStorage) return completePrivateUpload(actorId, id);
  const stored = await inspect(a.storageKey);
  const type = MEDIA_TYPES.find((t) => t.mime === a.mime)!;
  const fail = async (message: string) => {
    await remove(a.storageKey).catch(() => undefined);
    await db.delete(asset).where(eq(asset.id, id));
    return { ok: false as const, message };
  };
  if (!stored) return fail("הקובץ לא הגיע לאחסון. נסו שוב.");
  if (stored.size !== a.sizeBytes || stored.size > type.maxBytes) return fail("גודל הקובץ שהתקבל אינו תואם.");
  if (!type.magic(stored.head)) return fail("תוכן הקובץ אינו תואם את סוגו, ולכן הוא נדחה.");
  const [ready] = await db.update(asset).set({ status: "ready" }).where(eq(asset.id, id)).returning();
  await db.insert(auditLog).values({ actorId, action: "asset.upload", entity: "asset", entityId: id, details: { filename: a.filename, size: a.sizeBytes } });
  return { ok: true, asset: view(ready!) };
}

export async function listAssets(kind?: AssetKind): Promise<AssetView[]> {
  return listPrivateAssets(kind);
}

export async function setAltText(id: string, altText: string, actorId: string): Promise<boolean> {
  const [a] = await db.select().from(asset).where(and(eq(asset.id,id),eq(asset.status,"ready")));
  if (!a?.currentVersionId) return false;
  return (await editAssetVersion(actorId,id,a.currentVersionId,{ altText: altText.slice(0,300) })).ok;
}

/** Deletion is refused while any chapter, draft or published version still uses the file. */
export async function deleteAsset(actorId: string, id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }> {
  const deleted = await db.transaction(async tx => {
    const [a] = await tx.select().from(asset).where(eq(asset.id, id)).for("update");
    if (!a) return { ok: false as const, reason: "not_found" as const };
    const needle = `%"assetId": "${id}"%`;
    const counts = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int` }).from(courseDraft).where(sql`${courseDraft.content}::text like ${needle}`),
      tx.select({ n: sql<number>`count(*)::int` }).from(courseVersion).where(sql`${courseVersion.content}::text like ${needle}`),
      tx.select({ n: sql<number>`count(*)::int` }).from(chapter).where(sql`${chapter.content}::text like ${needle}`),
      tx.select({ n: sql<number>`count(*)::int` }).from(chapterVersion).where(sql`${chapterVersion.content}::text like ${needle}`),
    ]);
    if (counts.some(rows => (rows[0]?.n ?? 0) > 0)) return { ok: false as const, reason: "in_use" as const };
    const versions = await tx.select().from(assetVersion).where(eq(assetVersion.assetId,id));
    await tx.delete(asset).where(eq(asset.id,id));
    await tx.insert(auditLog).values({ actorId, action:"asset.delete", entity:"asset", entityId:id, details:{filename:a.filename} });
    return { ok: true as const, privateKeys: [...new Set(versions.flatMap(v => v.privateStorage && !v.metadata.embed ? [v.storageKey,...v.normalizedKey ? [v.normalizedKey] : []] : []))], publicKey:a.privateStorage ? null : a.storageKey };
  });
  if (!deleted.ok) return deleted;
  // Storage cleanup follows a successful commit, so a rolled-back deletion never breaks media.
  const cleanup = await Promise.allSettled([...deleted.privateKeys.map(key=>removePrivate(key)),...deleted.publicKey ? [remove(deleted.publicKey)] : []]);
  const failures=cleanup.filter(r=>r.status==="rejected").length;
  if(failures) await db.insert(auditLog).values({actorId,action:"asset.storage.cleanup_pending",entity:"asset",entityId:id,details:{failedObjects:failures,privateKeys:deleted.privateKeys,publicKey:deleted.publicKey}}).catch(()=>undefined);
  return {ok:true};
}

/** assetId → playable URL for the ids a course references. */
export async function resolveAssets(ids: string[]): Promise<Record<string, { src: string; mime: string }>> {
  if (!ids.length) return {};
  const rows = await db.select().from(asset).where(and(inArray(asset.id, ids), eq(asset.status, "ready"),eq(asset.privateStorage,false)));
  return Object.fromEntries(rows.map((a) => [a.id, { src: publicUrl(a.storageKey, a.id), mime: a.mime }]));
}

export async function getReady(id: string) {
  const [a] = await db.select().from(asset).where(and(eq(asset.id, id), eq(asset.status, "ready")));
  return a ?? null;
}
