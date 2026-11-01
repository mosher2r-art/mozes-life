import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { asset, auditLog, courseDraft, courseVersion } from "@/db/schema";
import { checkDeclared, MEDIA_TYPES, type AssetKind } from "@/lib/media-policy";
import { createUpload, driver, inspect, publicUrl, remove, type UploadTarget } from "./storage";

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
  if (driver() === "none") return { ok: false, message: "אחסון הקבצים עדיין לא הוגדר." };
  const check = checkDeclared(filename, mime, size);
  if (!check.ok) return check;
  const id = `a-${randomBytes(8).toString("hex")}`;
  const ext = filename.toLowerCase().split(".").pop()!;
  const now = new Date();
  const key = `${check.type.kind}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${ext}`;
  await db.insert(asset).values({
    id,
    kind: check.type.kind,
    filename: filename.slice(0, 200),
    mime: check.type.mime,
    sizeBytes: size,
    storageKey: key,
    uploadedBy: actorId,
  });
  return { ok: true, id, upload: await createUpload(key, check.type.mime, id) };
}

export async function getPending(id: string) {
  const [a] = await db.select().from(asset).where(and(eq(asset.id, id), eq(asset.status, "pending")));
  return a ?? null;
}

/** Verifies the stored bytes (size + magic signature) before the file becomes usable. */
export async function completeUpload(actorId: string, id: string): Promise<{ ok: true; asset: AssetView } | { ok: false; message: string }> {
  const a = await getPending(id);
  if (!a) return { ok: false, message: "ההעלאה לא נמצאה." };
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
  const rows = await db
    .select()
    .from(asset)
    .where(kind ? and(eq(asset.status, "ready"), eq(asset.kind, kind)) : eq(asset.status, "ready"))
    .orderBy(desc(asset.createdAt))
    .limit(500);
  return rows.map(view);
}

export async function setAltText(id: string, altText: string): Promise<boolean> {
  const r = await db.update(asset).set({ altText: altText.slice(0, 300) }).where(and(eq(asset.id, id), eq(asset.status, "ready"))).returning({ id: asset.id });
  return r.length > 0;
}

/** Deletion is refused while any draft or published version still uses the file. */
export async function deleteAsset(actorId: string, id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }> {
  const [a] = await db.select().from(asset).where(eq(asset.id, id));
  if (!a) return { ok: false, reason: "not_found" };
  const needle = `"assetId": "${id}"`;
  const [inDraft] = await db.select({ n: sql<number>`count(*)::int` }).from(courseDraft).where(sql`${courseDraft.content}::text like ${"%" + needle + "%"}`);
  const [inVersion] = await db.select({ n: sql<number>`count(*)::int` }).from(courseVersion).where(sql`${courseVersion.content}::text like ${"%" + needle + "%"}`);
  if ((inDraft?.n ?? 0) + (inVersion?.n ?? 0) > 0) return { ok: false, reason: "in_use" };
  await remove(a.storageKey).catch(() => undefined);
  await db.delete(asset).where(eq(asset.id, id));
  await db.insert(auditLog).values({ actorId, action: "asset.delete", entity: "asset", entityId: id, details: { filename: a.filename } });
  return { ok: true };
}

/** assetId → playable URL for the ids a course references. */
export async function resolveAssets(ids: string[]): Promise<Record<string, { src: string; mime: string }>> {
  if (!ids.length) return {};
  const rows = await db.select().from(asset).where(and(inArray(asset.id, ids), eq(asset.status, "ready")));
  return Object.fromEntries(rows.map((a) => [a.id, { src: publicUrl(a.storageKey, a.id), mime: a.mime }]));
}

export async function getReady(id: string) {
  const [a] = await db.select().from(asset).where(and(eq(asset.id, id), eq(asset.status, "ready")));
  return a ?? null;
}
