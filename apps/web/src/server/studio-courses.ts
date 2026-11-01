import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { Course, type CourseInput, flattenScreens } from "@mozes/content-schema";
import { validateCourse } from "@mozes/validator";
import { db } from "@/db";
import { contentHash } from "@/lib/content-hash";
import { auditLog, course, courseDraft, courseVersion, coursePackage, enrollment, user } from "@/db/schema";

const rid = (prefix: string) => `${prefix}-${randomBytes(5).toString("hex")}`;

export interface CourseRow {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  isDemo: boolean;
  kind: "native" | "package";
  latestVersion: number | null;
  learners: number;
  draftUpdatedAt: Date | null;
  unpublishedChanges: boolean;
}

export async function listCourses(): Promise<CourseRow[]> {
  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      status: course.status,
      isDemo: course.isDemo,
      kind: course.kind,
      publishedHash: courseVersion.contentHash,
      latestVersion: courseVersion.versionNo,
      draftContent: courseDraft.content,
      draftUpdatedAt: courseDraft.updatedAt,
      learners: sql<number>`(select count(*)::int from ${enrollment} where ${enrollment.courseId} = ${course.id})`,
    })
    .from(course)
    .leftJoin(courseVersion, eq(courseVersion.id, course.publishedVersionId))
    .leftJoin(courseDraft, eq(courseDraft.courseId, course.id))
    .orderBy(desc(course.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    isDemo: r.isDemo,
    kind: r.kind,
    latestVersion: r.latestVersion ?? null,
    learners: r.learners,
    draftUpdatedAt: r.draftUpdatedAt ?? null,
    unpublishedChanges: !!r.draftContent && contentHash(r.draftContent) !== r.publishedHash,
  }));
}

function starterContent(id: string, title: string): CourseInput {
  return {
    schema: "mozes-course",
    schemaVersion: 1,
    id,
    title,
    locale: "he",
    settings: { navigation: "linear", completion: { requireAllRequiredScreens: true, passingScore: null } },
    units: [
      {
        id: rid("u"),
        title: "יחידה 1",
        screens: [
          {
            id: rid("s"),
            title: "פתיחה",
            template: "text",
            slots: {
              body: [
                { id: rid("c"), type: "heading", text: title, level: 1 },
                { id: rid("c"), type: "richText", body: [{ kind: "paragraph", content: [{ text: "כתבו כאן את פתיח הקורס." }] }] },
              ],
            },
          },
        ],
      },
    ],
  };
}

export async function createCourse(actorId: string, title: string): Promise<string> {
  const id = rid("c");
  const content = Course.parse(starterContent(id, title));
  await db.transaction(async (tx) => {
    await tx.insert(course).values({ id, slug: id, title, status: "draft", createdBy: actorId });
    await tx.insert(courseDraft).values({ courseId: id, content, revision: 1, updatedBy: actorId });
    await tx.insert(auditLog).values({ actorId, action: "course.create", entity: "course", entityId: id, details: { title } });
  });
  return id;
}

export interface EditorData {
  id: string;
  status: "draft" | "published" | "archived";
  isDemo: boolean;
  content: Course;
  revision: number;
  publishedHash: string | null;
  latestVersion: number | null;
}

export async function getEditorData(courseId: string): Promise<EditorData | null> {
  const [row] = await db
    .select({ c: course, d: courseDraft, v: courseVersion })
    .from(course)
    .leftJoin(courseDraft, eq(courseDraft.courseId, course.id))
    .leftJoin(courseVersion, eq(courseVersion.id, course.publishedVersionId))
    .where(eq(course.id, courseId));
  if (!row) return null;

  let content = row.d?.content;
  let revision = row.d?.revision ?? 1;
  if (!content) {
    // A course published before drafts existed (e.g. the demo): start the draft from its live version.
    if (!row.v) return null;
    content = row.v.content;
    await db.insert(courseDraft).values({ courseId, content, revision: 1 }).onConflictDoNothing();
    revision = 1;
  }
  return {
    id: courseId,
    status: row.c.status,
    isDemo: row.c.isDemo,
    content: Course.parse(content),
    revision,
    publishedHash: row.v?.contentHash ?? null,
    latestVersion: row.v?.versionNo ?? null,
  };
}

export type SaveResult = { ok: true; revision: number } | { ok: false; reason: "not_found" | "conflict" | "invalid"; revision?: number; message?: string };

/** Saves the working draft. Structural schema only — completeness is checked at publish time. */
export async function saveDraft(courseId: string, actorId: string, input: unknown, baseRevision: number): Promise<SaveResult> {
  const parsed = Course.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message };
  if (parsed.data.id !== courseId) return { ok: false, reason: "invalid", message: "מזהה הקורס אינו תואם" };

  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(courseDraft).where(eq(courseDraft.courseId, courseId)).for("update");
    if (!draft) return { ok: false, reason: "not_found" } as const;
    if (draft.revision !== baseRevision) return { ok: false, reason: "conflict", revision: draft.revision } as const;
    const revision = draft.revision + 1;
    await tx.update(courseDraft).set({ content: parsed.data, revision, updatedBy: actorId, updatedAt: new Date() }).where(eq(courseDraft.courseId, courseId));
    await tx.update(course).set({ title: parsed.data.title }).where(eq(course.id, courseId));
    return { ok: true, revision } as const;
  });
}

export type PublishResult =
  | { ok: true; versionNo: number }
  | { ok: false; reason: "not_found" | "invalid" | "medical_unconfirmed" | "unchanged"; errors?: string[] };

export async function publishCourse(courseId: string, actorId: string, medicalConfirmed: boolean): Promise<PublishResult> {
  const [kindRow] = await db.select({ kind: course.kind, packageId: course.packageId }).from(course).where(eq(course.id, courseId));
  if (!kindRow) return { ok: false, reason: "not_found" };
  if (kindRow.kind === "package") return publishPackageCourse(courseId, actorId, kindRow.packageId);
  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(courseDraft).where(eq(courseDraft.courseId, courseId)).for("update");
    if (!draft) return { ok: false, reason: "not_found" } as const;

    const result = validateCourse(draft.content);
    if (!result.ok || !result.course) {
      return { ok: false, reason: "invalid", errors: result.issues.filter((i) => i.severity === "error").map((i) => i.message) } as const;
    }
    const medical = flattenScreens(result.course).filter((r) => r.screen.medical.relevant);
    if (medical.length && !medicalConfirmed) return { ok: false, reason: "medical_unconfirmed" } as const;

    const hash = contentHash(result.course);
    const [latest] = await tx
      .select()
      .from(courseVersion)
      .where(eq(courseVersion.courseId, courseId))
      .orderBy(desc(courseVersion.versionNo))
      .limit(1);
    if (latest?.contentHash === hash) return { ok: false, reason: "unchanged" } as const;

    const versionNo = (latest?.versionNo ?? 0) + 1;
    const versionId = randomUUID();
    await tx.insert(courseVersion).values({ id: versionId, courseId, versionNo, content: result.course, contentHash: hash, publishedBy: actorId });
    await tx.update(course).set({ status: "published", publishedVersionId: versionId, title: result.course.title }).where(eq(course.id, courseId));
    await tx.insert(auditLog).values({
      actorId,
      action: "course.publish",
      entity: "course",
      entityId: courseId,
      details: { versionNo, medicalScreens: medical.map((m) => m.screen.id), medicalConfirmedByPublisher: medical.length > 0 },
    });
    // Keep the draft byte-identical to what was published so "unpublished changes" is accurate.
    await tx.update(courseDraft).set({ content: result.course }).where(eq(courseDraft.courseId, courseId));
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
