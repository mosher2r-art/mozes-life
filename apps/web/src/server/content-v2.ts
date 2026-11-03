import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { Course, type CourseV2, type ScreenV2, mediaUses } from "@mozes/content-schema";
import { validateCourse, type ValidationContext } from "@mozes/validator";
import { db } from "@/db";
import { asset, assetVersion, chapter, screenReview, deviceModel, auditLog } from "@/db/schema";
import { DeviceInput } from "@/lib/media-v2-policy";
import { contentHash } from "@/lib/content-hash";

export type ContentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function screenContentHash(screen: ScreenV2, variables: CourseV2["settings"]["variables"], mediaIdentities:Record<string,string>): string {
  const medical = {relevant:screen.medical.relevant,sources:screen.medical.sources};
  const refs=new Set<string>();const visit=(value:unknown):void=>{if(Array.isArray(value))value.forEach(visit);else if(value && typeof value==="object"){if("assetId" in value && typeof value.assetId==="string")refs.add(value.assetId);Object.values(value).forEach(visit);}};visit(screen);
  return contentHash({ screen: { ...screen, medical }, variables: variables ?? {}, media:Object.fromEntries([...refs].sort().map(id=>[id,mediaIdentities[id] ?? "missing"])) });
}
/** Asset row locks are retained until the save/import/publication transaction commits. */
export async function documentContext(tx: ContentTx, doc: CourseV2, chapterId?: string, pins: Record<string,string> = {}, purpose: ValidationContext["purpose"] = "draft"): Promise<{ context: ValidationContext; versions: Map<string, typeof assetVersion.$inferSelect> }> {
  const ids = [...new Set(mediaUses(doc).flatMap(use => use.ref.assetId ? [use.ref.assetId] : []))].sort();
  const assets = ids.length ? await tx.select().from(asset).where(inArray(asset.id, ids)).orderBy(asset.id).for(purpose === "publish" ? "update" : "key share") : [];
  const versionIds = assets.flatMap(a => pins[a.id] ?? a.currentVersionId ?? []);
  const versions = new Map((versionIds.length ? await tx.select().from(assetVersion).where(inArray(assetVersion.id, versionIds)) : []).map(v => [v.assetId, v]));
  const assetContext: NonNullable<ValidationContext["assets"]> = {};
  for (const a of assets) { const v = versions.get(a.id); if (v && v.id === (pins[a.id] ?? a.currentVersionId)) assetContext[a.id] = { id: a.id, kind: a.kind, ready: a.status === "ready" && v.status === "ready", ...v.metadata }; }
  const reviewedScreenIds = new Set<string>();
  const identities=Object.fromEntries([...versions].map(([id,v])=>[id,v.contentIdentity]));
  if (chapterId) {
    const reviews = await tx.select().from(screenReview).where(eq(screenReview.chapterId, chapterId)).orderBy(desc(screenReview.seq));
    const latest = new Set<string>();
    for (const review of reviews) { const screen = doc.units.flatMap(u => u.screens).find(s => s.id === review.screenId); if (!screen || review.contentHash !== screenContentHash(screen, doc.settings.variables,identities) || latest.has(screen.id)) continue; latest.add(screen.id); if (review.status === "approved") reviewedScreenIds.add(screen.id); }
  }
  const deviceIds = [...new Set(doc.units.flatMap(u => u.screens).flatMap(s => Object.values(s.slots).flat()).flatMap(c => c.type === "simulation" && c.config.deviceModelId ? [c.config.deviceModelId] : []))];
  const devices = deviceIds.length ? await tx.select().from(deviceModel).where(inArray(deviceModel.id, deviceIds)).orderBy(deviceModel.id).for("key share") : [];
  return { context: { purpose, assets: assetContext, reviewedScreenIds, devices: Object.fromEntries(devices.map(d => [d.id, { status: d.status }])) }, versions };
}
export const assetReferenceErrors = (doc: CourseV2, context: ValidationContext) => validateCourse(doc, context).issues.filter(i => ["MISSING_ASSET", "ASSET_TYPE"].includes(i.code));
export async function reviewScreen(actorId: string, chapterId: string, screenId: string, revision: number, status: "approved" | "rejected", note: string, expectedMediaFingerprint:string) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(chapter).where(eq(chapter.id, chapterId)).for("update");
    if (!row || row.revision !== revision) return { ok: false as const, message: "הטיוטה השתנתה; רעננו ובדקו את הגרסה הנוכחית." };
    const doc = Course.parse(row.content);
    if (doc.schemaVersion !== 2) return { ok: false as const, message: "יש לשמור את הטיוטה ב־v2 לפני אישור מסך." };
    const screen = doc.units.flatMap(u => u.screens).find(s => s.id === screenId);
    if (!screen?.medical.relevant) return { ok: false as const, message: "המסך אינו מוגדר כתוכן רפואי." };
    if (status === "approved" && !screen.medical.sources?.length) return { ok: false as const, message: "יש לציין מקור רפואי ותאריך לפני אישור." };
    const loaded=await documentContext(tx,doc,chapterId,row.draftAssetPins ?? {},"publish");
    if(status==="approved" && (assetReferenceErrors(doc,loaded.context).some(issue=>issue.screenId===screenId) || mediaUses(doc).some(use=>use.screenId===screenId && "placeholder" in use.ref)))return {ok:false as const,message:"יש להשלים את נכסי המדיה של המסך לפני אישור תוכנו."};
    const identities=Object.fromEntries([...loaded.versions].map(([id,v])=>[id,v.contentIdentity]));
    if(contentHash(identities)!==expectedMediaFingerprint)return {ok:false as const,message:"המדיה בפרק השתנתה מאז התצוגה שנבדקה. רעננו ובדקו את הקבצים הנוכחיים לפני אישור."};
    await tx.insert(screenReview).values({ id: randomUUID(), chapterId, screenId, contentHash: screenContentHash(screen, doc.settings.variables,identities), status, reviewedBy: actorId, note: note.slice(0,2000) });
    await tx.insert(auditLog).values({ actorId, action: "chapter.screen.review", entity: "chapter", entityId: chapterId, details: { screenId, status, revision } });
    return { ok: true as const };
  });
}
export async function listDevices() { return db.select().from(deviceModel).orderBy(deviceModel.name); }
export async function createDevice(actorId: string, input: unknown) {
  const parsed = DeviceInput.safeParse(input); if (!parsed.success) return { ok: false as const, message: "פרטי דגם המכשיר או קישור המדריך אינם תקינים." };
  const id = randomUUID(); await db.insert(deviceModel).values({ id, ...parsed.data, createdBy: actorId }); return { ok: true as const, id };
}
export async function verifyDevice(actorId: string, id: string, evidence: { guideReviewed: boolean; trainerTested: boolean; notes: string }, expectedUpdatedAt: string) {
  if (!evidence.guideReviewed || !evidence.trainerTested || !evidence.notes.trim()) return { ok: false as const, message: "נדרשים אימות מדריך היצרן, בדיקה מול מכשיר הדרכה אמיתי ותיעוד הבדיקה." };
  return db.transaction(async tx => {
    const [row] = await tx.select().from(deviceModel).where(eq(deviceModel.id, id)).for("update");
    if (!row || row.updatedAt.toISOString() !== expectedUpdatedAt) return { ok: false as const, message: "דגם המכשיר השתנה; רעננו לפני האימות." };
    await tx.update(deviceModel).set({ status: "verified", verifiedBy: actorId, verifiedAt: new Date(), evidence: { ...evidence, notes: evidence.notes.slice(0,3000) } }).where(eq(deviceModel.id, id));
    await tx.insert(auditLog).values({ actorId, action: "device.verify", entity: "device_model", entityId: id });
    return { ok: true as const };
  });
}
