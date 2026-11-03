import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { parseVtt } from "@mozes/content-schema";
import { db } from "@/db";
import { asset, assetVersion, auditLog, course, courseVersion, enrollment } from "@/db/schema";
import { checkDeclared, MEDIA_TYPES, type AssetKind } from "@/lib/media-policy";
import { AssetMetadata, AssetMetadataEdit, parseEmbedUrl } from "@/lib/media-v2-policy";
import { normalizeLottie } from "@/lib/lottie-policy";
import { privateStorageAvailable, privateUpload, inspectPrivate, readPrivateBytes, putPrivateBytes, removePrivate, copyIntoPrivate, servePrivate } from "./storage-v2";
import { publicUrl } from "./storage";
import { hasActiveAccess } from "./access";
import type { ResolvedMedia } from "@mozes/player-react";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Version = typeof assetVersion.$inferSelect;
export type MediaResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; message: string };
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const nextNo = async (tx: Tx, assetId: string) => (await tx.select({ n: sql<number>`coalesce(max(${assetVersion.versionNo}),0)::int` }).from(assetVersion).where(eq(assetVersion.assetId, assetId)))[0]!.n + 1;
const endpoint = (a: string, v: string, enrollmentId?: string) => `/api/media/${encodeURIComponent(a)}/versions/${encodeURIComponent(v)}${enrollmentId ? `?enrollment=${encodeURIComponent(enrollmentId)}` : ""}`;
export function playable(v: Version, enrollmentId?: string): ResolvedMedia {
  return { src: v.privateStorage ? endpoint(v.assetId, v.id, enrollmentId) : publicUrl(v.normalizedKey ?? v.storageKey, v.assetId), mime: v.normalizedKey ? "application/json" : v.mime, creditText: v.metadata.creditText, width: v.metadata.width, height: v.metadata.height, durationMs: v.metadata.durationMs, embed: v.metadata.embed };
}
export function versionView(v: Version, kind: AssetKind) {
  return { id: v.assetId, versionId: v.id, versionNo: v.versionNo, kind, filename: v.filename, mime: v.mime, sizeBytes: v.sizeBytes, altText: v.metadata.altText, url: endpoint(v.assetId, v.id), metadata: v.metadata, createdAt: v.createdAt.toISOString() };
}
/** New uploads are private. Replacement does not change the active version until verified. */
export async function startPrivateUpload(actorId: string, filename: string, mime: string, size: number, replaceId?: string) {
  if (!privateStorageAvailable()) return { ok: false as const, message: "אחסון מדיה פרטי טרם הוגדר." };
  const check = checkDeclared(filename, mime, size); if (!check.ok) return check;
  const assetId = replaceId ?? id("a"), versionId = id("av"), key = `media/${assetId}/${versionId}.${check.type.ext[0]}`;
  const result = await db.transaction(async tx => {
    if (replaceId) {
      const [a] = await tx.select().from(asset).where(eq(asset.id, replaceId)).for("update");
      if (!a || a.status !== "ready") return { ok: false as const, message: "הנכס להחלפה לא נמצא." };
      if (a.kind !== check.type.kind) return { ok: false as const, message: "אפשר להחליף נכס רק בקובץ מאותו סוג." };
    } else await tx.insert(asset).values({ id: assetId, kind: check.type.kind, filename, mime: check.type.mime, sizeBytes: size, storageKey: key, uploadedBy: actorId, privateStorage: true });
    await tx.insert(assetVersion).values({ id: versionId, assetId, versionNo: await nextNo(tx, assetId), contentIdentity:versionId, filename, mime: check.type.mime, sizeBytes: size, storageKey: key, metadata: AssetMetadata.parse({}), createdBy: actorId });
    if (!replaceId) await tx.update(asset).set({ currentVersionId: versionId }).where(eq(asset.id, assetId));
    return { ok: true as const };
  });
  if (!result.ok) return result;
  return { ok: true as const, id: assetId, versionId, upload: await privateUpload(key, check.type.mime, assetId, versionId) };
}
export async function pendingVersion(assetId: string, versionId?: string) {
  const [row] = await db.select().from(assetVersion).where(and(eq(assetVersion.assetId, assetId), eq(assetVersion.status, "pending"), versionId ? eq(assetVersion.id, versionId) : undefined)).orderBy(desc(assetVersion.versionNo)).limit(1);
  return row ?? null;
}
export async function completePrivateUpload(actorId: string, assetId: string, versionId?: string) {
  const v = await pendingVersion(assetId, versionId);
  if (!v || v.createdBy !== actorId) return { ok: false as const, message: "ההעלאה לא נמצאה או שאינה שייכת למשתמש." };
  const type = MEDIA_TYPES.find(t => t.mime === v.mime);
  if (!type) return { ok: false as const, message: "סוג הקובץ אינו נתמך." };
  // Never serve the key addressed by a still-valid presigned PUT. Copy first, then inspect
  // that immutable copy, avoiding both overwrite-after-approval and validation/copy races.
  const readyKey = `media/${assetId}/${id("ready")}.${type.ext[0]}`;
  let normalizedKey: string | null = null, metadata = v.metadata;
  try {
    await copyIntoPrivate(v.storageKey, true, readyKey, v.sizeBytes, v.mime);
    const stored = await inspectPrivate(readyKey);
    if (!stored || stored.size !== v.sizeBytes || stored.size > type.maxBytes || !type.magic(stored.head)) throw Error("תוכן הקובץ או גודלו אינם תואמים; ההעלאה לא אושרה.");
    if (type.kind === "animation") {
      const normalized = await normalizeLottie(await readPrivateBytes(readyKey, type.maxBytes), v.filename);
      normalizedKey = `${readyKey}.normalized.json`;
      await putPrivateBytes(normalizedKey, normalized.bytes, "application/json");
      metadata = { ...metadata, width: normalized.width, height: normalized.height, durationMs: normalized.durationMs };
    }
    if (type.kind === "captions") parseVtt((await readPrivateBytes(readyKey, type.maxBytes)).toString("utf8"));
  } catch (error) { await removePrivate(readyKey).catch(() => undefined); if (normalizedKey) await removePrivate(normalizedKey).catch(() => undefined); return { ok: false as const, message: error instanceof Error ? error.message : "בדיקת תוכן הקובץ נכשלה." }; }
  const ready = await db.transaction(async tx => {
    const [a] = await tx.select().from(asset).where(eq(asset.id, assetId)).for("update");
    const [fresh] = await tx.select().from(assetVersion).where(eq(assetVersion.id, v.id)).for("update");
    if (!a || !fresh || fresh.status !== "pending") return null;
    const [result] = await tx.update(assetVersion).set({ status: "ready", storageKey: readyKey, normalizedKey, metadata }).where(eq(assetVersion.id, v.id)).returning();
    // A completion that arrives late may not replace a more recent accepted version.
    const [current] = a.currentVersionId ? await tx.select().from(assetVersion).where(eq(assetVersion.id, a.currentVersionId)) : [];
    if (!current || a.currentVersionId===v.id || current.status === "pending" || current.versionNo < v.versionNo) await tx.update(asset).set({ status: "ready", currentVersionId: v.id }).where(eq(asset.id, assetId));
    await tx.insert(auditLog).values({ actorId, action: "asset.version.upload", entity: "asset", entityId: assetId, details: { versionId: v.id, versionNo: v.versionNo } });
    return result ? versionView(result, a.kind) : null;
  });
  if (ready) await removePrivate(v.storageKey).catch(() => undefined);
  else { await removePrivate(readyKey).catch(() => undefined); if (normalizedKey) await removePrivate(normalizedKey).catch(() => undefined); }
  return ready ? { ok: true as const, asset: ready } : { ok: false as const, message: "ההעלאה כבר הושלמה; רעננו את הספרייה." };
}
export async function listPrivateAssets(kind?: AssetKind) {
  const rows = await db.select({ a: asset, v: assetVersion }).from(asset).innerJoin(assetVersion, eq(asset.currentVersionId, assetVersion.id)).where(and(eq(asset.status, "ready"), eq(assetVersion.status, "ready"), kind ? eq(asset.kind, kind) : undefined)).orderBy(desc(asset.createdAt)).limit(500);
  return rows.map(({ a, v }) => versionView(v, a.kind));
}
/** Rights/alt edits and human reviews append versions; existing snapshots never change. */
export async function editAssetVersion(actorId: string, assetId: string, expectedVersionId: string, input: unknown, review?: "approved" | "rejected") {
  const parsed = AssetMetadataEdit.safeParse(input); if (!parsed.success) return { ok: false as const, message: "מטא־דאטה אינה תקינה. שדות האישור נקבעים בשרת בלבד." };
  return db.transaction(async tx => {
    const [a] = await tx.select().from(asset).where(eq(asset.id, assetId)).for("update");
    if (!a || a.currentVersionId !== expectedVersionId) return { ok: false as const, message: "גרסת הנכס השתנתה; רעננו לפני השמירה." };
    const [v] = await tx.select().from(assetVersion).where(and(eq(assetVersion.id, expectedVersionId), eq(assetVersion.status, "ready")));
    if (!v) return { ok: false as const, message: "גרסת הנכס אינה מוכנה." };
    const metadata = AssetMetadata.parse({ ...v.metadata, ...parsed.data, ...(review ? { medicalStatus: review, reviewedBy: actorId, reviewedAt: new Date().toISOString() } : { medicalStatus: "draft", reviewedBy: undefined, reviewedAt: undefined }) });
    const newVersionId = id("av"), versionNo = await nextNo(tx, assetId);
    await tx.insert(assetVersion).values({ ...v, id: newVersionId, versionNo, metadata, createdBy: actorId, createdAt: new Date() });
    await tx.update(asset).set({ currentVersionId: newVersionId, altText: metadata.altText }).where(eq(asset.id, assetId));
    await tx.insert(auditLog).values({ actorId, action: review ? "asset.version.review" : "asset.version.metadata", entity: "asset", entityId: assetId, details: { versionId: newVersionId, previousVersionId: v.id, status: review } });
    return { ok: true as const, versionId: newVersionId, versionNo };
  });
}
export async function createEmbedAsset(actorId: string, value: string, title: string) {
  const embed = parseEmbedUrl(value); if (!embed) return { ok: false as const, message: "נדרש קישור HTTPS תקין של YouTube או Vimeo." };
  const assetId = id("a"), versionId = id("av"), filename = title.slice(0,200) || "וידאו מוטמע";
  await db.transaction(async tx => {
    await tx.insert(asset).values({ id: assetId, kind: "video", filename, mime: "application/x-mozes-video-embed", sizeBytes: 0, storageKey: `embed/${assetId}`, status: "ready", privateStorage: true, uploadedBy: actorId });
    await tx.insert(assetVersion).values({ id: versionId, assetId, versionNo: 1, contentIdentity:versionId, filename, mime: "application/x-mozes-video-embed", sizeBytes: 0, storageKey: `embed/${assetId}`, status: "ready", metadata: AssetMetadata.parse({ embed, source: value }), createdBy: actorId });
    await tx.update(asset).set({ currentVersionId: versionId }).where(eq(asset.id, assetId));
    await tx.insert(auditLog).values({ actorId, action: "asset.embed.create", entity: "asset", entityId: assetId, details: { provider: embed.provider } });
  });
  return { ok: true as const, id: assetId, versionId };
}
export async function assetHistory(assetId: string) { return db.select().from(assetVersion).where(and(eq(assetVersion.assetId, assetId), eq(assetVersion.status, "ready"))).orderBy(desc(assetVersion.versionNo)); }
export async function resolveVersionedAssets(ids: string[], manifest: Record<string,string> = {}, enrollmentId?: string): Promise<Record<string, ResolvedMedia>> {
  if (!ids.length) return {};
  const rows = await db.select({ a: asset, v: assetVersion }).from(asset).innerJoin(assetVersion, eq(asset.id, assetVersion.assetId)).where(and(inArray(asset.id, [...new Set(ids)]), eq(assetVersion.status, "ready")));
  return Object.fromEntries(rows.filter(({ a, v }) => (!enrollmentId || !!manifest[a.id]) && v.id === (manifest[a.id] ?? a.currentVersionId)).map(({ a, v }) => [a.id, playable(v, enrollmentId)]));
}
/** Publication calls this while holding the asset row lock in its own transaction. */
export async function ensurePrivateVersion(tx: Tx, actorId: string, v: Version): Promise<Version> {
  if (v.privateStorage || v.metadata.embed) return v;
  if (!privateStorageAvailable()) throw Error("פרסום v2 דורש אחסון פרטי מוגדר");
  const newId = id("av"), key = `media/${v.assetId}/${newId}.${v.filename.split(".").pop()}`;
  await copyIntoPrivate(v.storageKey, v.privateStorage, key, v.sizeBytes, v.mime);
  const [result] = await tx.insert(assetVersion).values({ ...v, id: newId, versionNo: await nextNo(tx, v.assetId), storageKey: key, privateStorage: true, createdBy: actorId, createdAt: new Date() }).returning();
  await tx.update(asset).set({ currentVersionId: newId }).where(and(eq(asset.id, v.assetId),eq(asset.currentVersionId,v.id))); return result!;
}
/** Checks enrollment ownership, current license and exact pinned version, on every GET. */
export async function readAuthorizedVersion(assetId: string, versionId: string, userId: string, staff: boolean, enrollmentId: string | null, range: string | null): Promise<Response> {
  const [v] = await db.select().from(assetVersion).where(and(eq(assetVersion.id, versionId), eq(assetVersion.assetId, assetId), eq(assetVersion.status, "ready")));
  if (!v || v.metadata.embed) return new Response(null, { status: 404 });
  if (!staff) {
    if (!enrollmentId) return new Response(null, { status: 404 });
    const [row] = await db.select({ e: enrollment, manifest: courseVersion.assetManifest }).from(enrollment).innerJoin(courseVersion, eq(enrollment.courseVersionId, courseVersion.id)).innerJoin(course,and(eq(enrollment.courseId,course.id),eq(course.status,"published"),eq(courseVersion.courseId,course.id))).where(and(eq(enrollment.id, enrollmentId), eq(enrollment.userId, userId)));
    if (!row || row.manifest[assetId] !== versionId || !await hasActiveAccess(db, userId, row.e.courseId)) return new Response(null, { status: 404 });
  }
  // Legacy public bytes are never exposed through this endpoint as if they were private.
  if (!v.privateStorage) return Response.redirect(publicUrl(v.storageKey, assetId), 302);
  return servePrivate(v.normalizedKey ?? v.storageKey, v.normalizedKey ? "application/json" : v.mime, range);
}
