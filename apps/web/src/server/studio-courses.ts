import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { Course, type CourseInput, composeCourse, flattenScreens, isQuestion } from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import { db } from "@/db";
import { contentHash } from "@/lib/content-hash";
import { asset, auditLog, chapter, course, courseDraft, courseVersion, coursePackage, enrollment, user } from "@/db/schema";
import { chaptersByIds, chaptersFromLegacy, rid } from "./chapters";
import { prepareChapterPublication, recordChapterPublication } from "./chapter-versions";
import { collectAssetIds } from "@/lib/collect-assets";
import type { ValidationContext } from "@mozes/validator";
import { ensurePrivateVersion } from "./media-v2";

export interface CourseRow {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  isDemo: boolean;
  kind: "native" | "package";
  latestVersion: number | null;
  learners: number;
  chapters: number;
  certificateEnabled: boolean;
  updatedAt: Date;
  unpublishedChanges: boolean;
}

type CourseMeta = { id: string; title: string; chapterIds: string[] | null; passingScore: number | null };

/** The learner-facing document a course would publish right now (from the current chapters). */
function composeWith(c: CourseMeta, chapters: Map<string, { title: string; kind: "lesson" | "exam"; doc: Course; updatedAt: Date }>): CourseInput {
  const list = (c.chapterIds ?? []).flatMap((id) => {
    const ch = chapters.get(id);
    return ch ? [ch] : [];
  });
  // A passing score applies to exams only; a course without exam chapters is completion-based.
  const passingScore = list.some((ch) => ch.kind === "exam") ? c.passingScore : null;
  return composeCourse({ id: c.id, title: c.title, passingScore, chapters: list });
}

/** Hash of the composed document, after defaults are applied exactly as at publish time. */
function composedHash(doc: CourseInput): string | null {
  const r = Course.safeParse(doc);
  return r.success ? contentHash(r.data) : null;
}

export async function listCourses(): Promise<CourseRow[]> {
  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      status: course.status,
      isDemo: course.isDemo,
      kind: course.kind,
      chapterIds: course.chapterIds,
      passingScore: course.passingScore,
      certificateEnabled: course.certificateEnabled,
      updatedAt: course.updatedAt,
      publishedHash: courseVersion.contentHash,
      latestVersion: courseVersion.versionNo,
      learners: sql<number>`(select count(*)::int from ${enrollment} where ${enrollment.courseId} = ${course.id})`,
    })
    .from(course)
    .leftJoin(courseVersion, eq(courseVersion.id, course.publishedVersionId))
    .orderBy(desc(course.updatedAt));
  const chapters = new Map((await chaptersByIds([...new Set(rows.flatMap((r) => r.chapterIds ?? []))])).map((c) => [c.id, c]));
  return rows.map((r) => {
    const latest = r.chapterIds ? Math.max(r.updatedAt.getTime(), ...r.chapterIds.map((id) => chapters.get(id)?.updatedAt.getTime() ?? 0)) : r.updatedAt.getTime();
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      isDemo: r.isDemo,
      kind: r.kind,
      latestVersion: r.latestVersion ?? null,
      learners: r.learners,
      chapters: r.chapterIds?.length ?? 0,
      certificateEnabled: r.certificateEnabled,
      updatedAt: new Date(latest),
      unpublishedChanges: r.kind === "native" && !!r.chapterIds && !!r.publishedHash && composedHash(composeWith(r, chapters)) !== r.publishedHash,
    };
  });
}

export async function createCourse(actorId: string, title: string): Promise<string> {
  const id = rid("c");
  await db.transaction(async (tx) => {
    await tx.insert(course).values({ id, slug: id, title, status: "draft", chapterIds: [], createdBy: actorId });
    await tx.insert(auditLog).values({ actorId, action: "course.create", entity: "course", entityId: id, details: { title } });
  });
  return id;
}

/**
 * Courses created before the chapter bank kept one document per course. On first open, each of its
 * units becomes a bank chapter and the course points at them. Idempotent and race-safe.
 */
async function ensureChapters(courseId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(course).where(eq(course.id, courseId)).for("update");
    if (!c || c.kind !== "native" || c.chapterIds) return;
    const [draft] = await tx.select().from(courseDraft).where(eq(courseDraft.courseId, courseId));
    const [published] = c.publishedVersionId ? await tx.select().from(courseVersion).where(eq(courseVersion.id, c.publishedVersionId)) : [];
    const source = draft?.content ?? published?.content;
    if (!source) {
      await tx.update(course).set({ chapterIds: [] }).where(eq(course.id, courseId));
      return;
    }
    const doc = Course.parse(source);
    const ids = await chaptersFromLegacy(tx, c.createdBy, doc);
    await tx.update(course).set({ chapterIds: ids, passingScore: doc.settings.completion.passingScore }).where(eq(course.id, courseId));
    await tx.insert(auditLog).values({ action: "course.migrate_to_chapters", entity: "course", entityId: courseId, details: { chapters: ids } });
  });
}

export interface BuilderChapter {
  id: string;
  title: string;
  kind: "lesson" | "exam";
  screens: number;
  questions: number;
  medicalScreens: number;
  updatedAt: string;
}

export interface BuilderData {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  isDemo: boolean;
  revision: number;
  certificateEnabled: boolean;
  passingScore: number | null;
  chapters: BuilderChapter[];
  /** Ids in chapter_ids that no longer exist in the bank. */
  missing: number;
  composed: CourseInput;
  latestVersion: number | null;
  publishedAt: string | null;
  unpublishedChanges: boolean;
}

export async function getCourseBuilder(courseId: string): Promise<BuilderData | null> {
  await ensureChapters(courseId);
  const [row] = await db
    .select({ c: course, v: courseVersion })
    .from(course)
    .leftJoin(courseVersion, eq(courseVersion.id, course.publishedVersionId))
    .where(and(eq(course.id, courseId), eq(course.kind, "native")));
  if (!row) return null;
  const ids = row.c.chapterIds ?? [];
  const list = await chaptersByIds(ids);
  const composed = composeWith(row.c, new Map(list.map((c) => [c.id, c])));
  return {
    id: row.c.id,
    title: row.c.title,
    status: row.c.status,
    isDemo: row.c.isDemo,
    revision: row.c.builderRevision,
    certificateEnabled: row.c.certificateEnabled,
    passingScore: row.c.passingScore,
    chapters: list.map((c) => {
      const screens = c.doc.units[0]?.screens ?? [];
      return {
        id: c.id,
        title: c.title,
        kind: c.kind,
        screens: screens.length,
        questions: screens.flatMap((s) => Object.values(s.slots).flat()).filter(isQuestion).length,
        medicalScreens: screens.filter((s) => s.medical.relevant).length,
        updatedAt: c.updatedAt.toISOString(),
      };
    }),
    missing: ids.length - list.length,
    composed,
    latestVersion: row.v?.versionNo ?? null,
    publishedAt: row.v?.publishedAt?.toISOString() ?? null,
    unpublishedChanges: !!row.v && composedHash(composed) !== row.v.contentHash,
  };
}

export const CourseUpdate = z
  .object({
    baseRevision: z.number().int().min(1),
    title: z.string().trim().min(2, "שם הקורס קצר מדי").max(160).optional(),
    chapterIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(50).optional(),
    certificateEnabled: z.boolean().optional(),
    passingScore: z.number().int().min(1, "ציון עובר בין 1 ל-100").max(100, "ציון עובר בין 1 ל-100").nullable().optional(),
  })
  .strict();
export type CourseUpdate = z.infer<typeof CourseUpdate>;

export type UpdateResult = { ok: true; revision: number } | { ok: false; reason: "not_found" | "conflict" | "invalid"; message?: string; revision?: number };

export async function updateCourse(courseId: string, actorId: string, u: CourseUpdate): Promise<UpdateResult> {
  if (u.chapterIds) {
    if (new Set(u.chapterIds).size !== u.chapterIds.length) return { ok: false, reason: "invalid", message: "אותו פרק לא יכול להופיע פעמיים באותו קורס." };
    const found = await chaptersByIds(u.chapterIds);
    if (found.length !== u.chapterIds.length) return { ok: false, reason: "invalid", message: "אחד הפרקים לא נמצא במאגר." };
  }
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(course).where(eq(course.id, courseId)).for("update");
    if (!c) return { ok: false, reason: "not_found" } as const;
    if (c.kind === "package" && (u.chapterIds !== undefined || u.passingScore !== undefined)) {
      return { ok: false, reason: "invalid", message: "בלומדה מיובאת הציון נקבע בתוך הלומדה עצמה." } as const;
    }
    if (c.builderRevision !== u.baseRevision) return { ok: false, reason: "conflict", revision: c.builderRevision } as const;
    const revision = c.builderRevision + 1;
    await tx
      .update(course)
      .set({
        builderRevision: revision,
        ...(u.title !== undefined && { title: u.title }),
        ...(u.chapterIds !== undefined && { chapterIds: u.chapterIds }),
        ...(u.certificateEnabled !== undefined && { certificateEnabled: u.certificateEnabled }),
        ...(u.passingScore !== undefined && { passingScore: u.passingScore }),
      })
      .where(eq(course.id, courseId));
    if (u.certificateEnabled !== undefined || u.passingScore !== undefined) {
      await tx.insert(auditLog).values({ actorId, action: "course.settings", entity: "course", entityId: courseId, details: { certificateEnabled: u.certificateEnabled, passingScore: u.passingScore } });
    }
    return { ok: true, revision } as const;
  });
}

export type PublishResult =
  | { ok: true; versionNo: number }
  | { ok: false; reason: "not_found" | "invalid" | "medical_unconfirmed" | "unchanged"; errors?: string[]; problems?:{message:string;chapterId?:string;screenId?:string;path?:string}[] };

export async function publishCourse(courseId: string, actorId: string, medicalConfirmed: boolean): Promise<PublishResult> {
  const [kindRow] = await db.select({ kind: course.kind, packageId: course.packageId }).from(course).where(eq(course.id, courseId));
  if (!kindRow) return { ok: false, reason: "not_found" };
  if (kindRow.kind === "package") return publishPackageCourse(courseId, actorId, kindRow.packageId);
  await ensureChapters(courseId);
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(course).where(eq(course.id, courseId)).for("update");
    if (!c) return { ok: false, reason: "not_found" } as const;
    const ids = c.chapterIds ?? [];
    if (!ids.length) return { ok: false, reason: "invalid", errors: ["אין פרקים בקורס. הוסיפו לפחות פרק אחד."] } as const;
    // Read and lock every chapter in a consistent order within this publication transaction.
    const chapterRows = await tx.select().from(chapter).where(inArray(chapter.id, ids)).orderBy(chapter.id).for("update");
    const byId = new Map(chapterRows.map(row => [row.id, row]));
    const list = ids.flatMap(id => { const row = byId.get(id); return row ? [{ id: row.id, title: row.title, kind: row.kind, doc: Course.parse(row.content), updatedAt: row.updatedAt }] : []; });
    if (list.length !== ids.length) return { ok: false, reason: "invalid", errors: ["אחד הפרקים בקורס נמחק מהמאגר."] } as const;
    const hasExam = list.some((ch) => ch.kind === "exam");
    if (c.certificateEnabled && hasExam && c.passingScore === null) {
      return { ok: false, reason: "invalid", errors: ["בקורס עם מבחן ותעודה יש לקבוע ציון עובר."] } as const;
    }

    const assetManifest: Record<string,string> = {}, reviewedScreenIds = new Set<string>();
    const assets: NonNullable<ValidationContext["assets"]> = {}, devices: NonNullable<ValidationContext["devices"]> = {};
    const isV2 = list.some(ch => ch.doc.schemaVersion === 2);
    // Acquire all media locks globally before per-chapter processing to prevent lock inversion.
    const mediaIds = [...new Set(list.flatMap(ch => collectAssetIds(ch.doc)))].sort();
    if (mediaIds.length) await tx.select({ id: asset.id }).from(asset).where(inArray(asset.id, mediaIds)).orderBy(asset.id).for("update");
    const prepared = [];
    const problems:NonNullable<Extract<PublishResult,{ok:false}>["problems"]>=[];
    if (isV2) for (const row of chapterRows) {
      const result = await prepareChapterPublication(tx, row);
      if (!result.ok){if(result.issues)problems.push(...result.issues.filter(i=>i.severity==="error").map(i=>({message:i.message,chapterId:row.id,screenId:i.screenId,path:i.path})));else problems.push(...result.errors.map(message=>({message,chapterId:row.id})));continue;}
      for (const [assetId, versionId] of Object.entries(result.manifest)) {
        if (assetManifest[assetId] && assetManifest[assetId] !== versionId) return { ok: false, reason: "invalid", errors: ["שני פרקים מקבעים גרסאות שונות של אותו נכס. יש לבחור גרסה אחידה בטיוטות לפני הפרסום."] } as const;
        assetManifest[assetId] = versionId;
      }
      result.reviewedScreenIds.forEach(id => reviewedScreenIds.add(id)); Object.assign(assets, result.assets); Object.assign(devices, result.devices);
      prepared.push({ row, ...result });
    }
    if(problems.length)return {ok:false,reason:"invalid",errors:problems.map(p=>p.message),problems} as const;
    if (!isV2 && mediaIds.length) {
      const [privateAsset] = await tx.select({ id: asset.id }).from(asset).where(and(inArray(asset.id, mediaIds), eq(asset.privateStorage, true))).limit(1);
      if (privateAsset) return { ok: false, reason: "invalid", errors: ["מדיה חדשה דורשת גרסת v2. פתחו ושמרו את טיוטות הפרקים לפני פרסום הקורס."] } as const;
    }
    const result = validateCourse(composeWith(c, new Map(list.map((x) => [x.id, x]))), isV2 ? { purpose: "publish", assets, devices, reviewedScreenIds } : undefined);
    if (!result.ok || !result.course) {
      return { ok: false, reason: "invalid", errors: result.issues.filter((i) => i.severity === "error").map((i) => i.message) } as const;
    }
    const medical = flattenScreens(result.course).filter((r) => r.screen.medical.relevant);
    if (!isV2 && medical.length && !medicalConfirmed) return { ok: false, reason: "medical_unconfirmed" } as const;

    const hash = contentHash(result.course);
    const [latest] = await tx.select().from(courseVersion).where(eq(courseVersion.courseId, courseId)).orderBy(desc(courseVersion.versionNo)).limit(1);
    if (latest?.contentHash === hash && contentHash(latest.assetManifest) === contentHash(assetManifest)) return { ok: false, reason: "unchanged" } as const;

    const versionNo = (latest?.versionNo ?? 0) + 1;
    const versionId = randomUUID();
    const versions=new Map(prepared.flatMap(ch=>[...ch.versions]));
    for(const [id,version] of versions)assetManifest[id]=(await ensurePrivateVersion(tx,actorId,version)).id;
    for (const ch of prepared) await recordChapterPublication(tx, ch.row, actorId, ch.doc, Object.fromEntries(Object.keys(ch.manifest).map(id=>[id,assetManifest[id]!])));
    await tx.insert(courseVersion).values({ id: versionId, courseId, versionNo, content: result.course, contentHash: hash, assetManifest, publishedBy: actorId });
    await tx.update(course).set({ status: "published", publishedVersionId: versionId }).where(eq(course.id, courseId));
    await tx.insert(auditLog).values({
      actorId,
      action: "course.publish",
      entity: "course",
      entityId: courseId,
      details: { versionNo, chapters: ids, medicalScreens: medical.map((m) => m.screen.id), medicalConfirmedByPublisher: medical.length > 0 },
    });
    return { ok: true, versionNo } as const;
  });
}

export async function listCourseLearners(courseId: string) {
  return db
    .select({ id: enrollment.id, name: user.name, email: user.email, status: enrollment.status, progress: enrollment.progressPercent, score: enrollment.scorePercent })
    .from(enrollment)
    .innerJoin(user, eq(user.id, enrollment.userId))
    .where(eq(enrollment.courseId, courseId))
    .orderBy(user.name);
}

/** Imported courseware: the published version points at an immutable, verified package. */
async function publishPackageCourse(courseId: string, actorId: string, packageId: string | null): Promise<PublishResult> {
  if (!packageId) return { ok: false, reason: "invalid", errors: ["לקורס לא משויכת חבילה."] };
  const [pkg] = await db.select().from(coursePackage).where(eq(coursePackage.id, packageId));
  if (!pkg) return { ok: false, reason: "invalid", errors: ["החבילה לא נמצאה."] };
  const content = { kind: "package", packageId, format: pkg.format };
  const hash = contentHash(content);
  return db.transaction(async (tx) => {
    const [latest] = await tx.select().from(courseVersion).where(eq(courseVersion.courseId, courseId)).orderBy(desc(courseVersion.versionNo)).limit(1);
    if (latest?.contentHash === hash) return { ok: false, reason: "unchanged" } as const;
    const versionNo = (latest?.versionNo ?? 0) + 1;
    const versionId = randomUUID();
    await tx.insert(courseVersion).values({ id: versionId, courseId, versionNo, content, contentHash: hash, publishedBy: actorId });
    await tx.update(course).set({ status: "published", publishedVersionId: versionId }).where(eq(course.id, courseId));
    await tx.insert(auditLog).values({ actorId, action: "course.publish", entity: "course", entityId: courseId, details: { versionNo, packageId } });
    return { ok: true, versionNo } as const;
  });
}

export async function getPackageCourse(courseId: string) {
  const [row] = await db
    .select({ c: course, p: coursePackage, v: courseVersion })
    .from(course)
    .leftJoin(coursePackage, eq(coursePackage.id, course.packageId))
    .leftJoin(courseVersion, eq(courseVersion.id, course.publishedVersionId))
    .where(and(eq(course.id, courseId), eq(course.kind, "package")));
  return row ?? null;
}
