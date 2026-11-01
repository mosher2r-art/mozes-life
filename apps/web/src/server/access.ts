import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, course, courseAccess, enrollment, membership, organization, user } from "@/db/schema";
import { type AccessState, stateOf } from "@/lib/access-rules";

export { type AccessState, parsePeople, type PersonLine, stateOf } from "@/lib/access-rules";

/** Today's calendar date in Israel — access dates are whole days in local time. */
export const TODAY_IL = sql`(now() at time zone 'Asia/Jerusalem')::date`;
const ACTIVE = sql`${courseAccess.revokedAt} is null and ${courseAccess.validFrom} <= ${TODAY_IL} and (${courseAccess.validUntil} is null or ${courseAccess.validUntil} >= ${TODAY_IL})`;

export async function todayIL(): Promise<string> {
  const r = await db.execute<{ d: string }>(sql`select to_char(${TODAY_IL}, 'YYYY-MM-DD') as d`);
  return r.rows[0]!.d;
}

/** Grants that apply to a user: personal ones and those of every organization they belong to. */
const appliesTo = (userId: string) =>
  or(eq(courseAccess.userId, userId), inArray(courseAccess.orgId, db.select({ id: membership.orgId }).from(membership).where(eq(membership.userId, userId))));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Server-side gate used before any learning action. */
export async function hasActiveAccess(tx: Tx | typeof db, userId: string, courseId: string): Promise<boolean> {
  const r = await tx.select({ id: courseAccess.id }).from(courseAccess).where(and(eq(courseAccess.courseId, courseId), appliesTo(userId), ACTIVE)).limit(1);
  return r.length > 0;
}

/** Creates progress records for every course the learner can currently open. */
export async function ensureEnrollments(userId: string): Promise<void> {
  const active = await db.selectDistinct({ courseId: courseAccess.courseId }).from(courseAccess).where(and(appliesTo(userId), ACTIVE));
  if (!active.length) return;
  await db
    .insert(enrollment)
    .values(active.map((a) => ({ id: randomUUID(), userId, courseId: a.courseId })))
    .onConflictDoNothing({ target: [enrollment.userId, enrollment.courseId] });
}

export interface CourseAccessSummary {
  state: AccessState;
  validFrom: string;
  validUntil: string | null;
}

/** The most favourable access window per course for this learner (active > scheduled > expired). */
export async function accessByCourse(userId: string): Promise<Map<string, CourseAccessSummary>> {
  const [today, grants] = await Promise.all([
    todayIL(),
    db.select({ courseId: courseAccess.courseId, validFrom: courseAccess.validFrom, validUntil: courseAccess.validUntil, revokedAt: courseAccess.revokedAt }).from(courseAccess).where(appliesTo(userId)),
  ]);
  const rank: Record<AccessState, number> = { active: 3, scheduled: 2, expired: 1, revoked: 0 };
  const out = new Map<string, CourseAccessSummary>();
  for (const g of grants) {
    const s: CourseAccessSummary = { state: stateOf(g, today), validFrom: g.validFrom, validUntil: g.validUntil };
    const prev = out.get(g.courseId);
    const better =
      !prev ||
      rank[s.state] > rank[prev.state] ||
      (s.state === prev.state && s.state === "active" && (s.validUntil === null || (prev.validUntil !== null && s.validUntil > prev.validUntil))) ||
      (s.state === prev.state && s.state === "scheduled" && s.validFrom < prev.validFrom) ||
      (s.state === prev.state && s.state === "expired" && (s.validUntil ?? "") > (prev.validUntil ?? ""));
    if (better) out.set(g.courseId, s);
  }
  return out;
}

/* ───────────── Administration ───────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface GrantInput {
  courseIds: string[];
  orgId?: string;
  userIds?: string[];
  validFrom: string;
  validUntil: string | null;
  note?: string;
}

export async function grantAccess(actorId: string, input: GrantInput): Promise<{ ok: true; created: number } | { ok: false; message: string }> {
  if (!DATE_RE.test(input.validFrom) || (input.validUntil && !DATE_RE.test(input.validUntil))) return { ok: false, message: "תאריך לא תקין." };
  if (input.validUntil && input.validUntil < input.validFrom) return { ok: false, message: "תאריך הסיום מוקדם מתאריך ההתחלה." };
  const subjects = input.orgId ? [{ orgId: input.orgId, userId: null }] : (input.userIds ?? []).map((u) => ({ orgId: null, userId: u }));
  if (!subjects.length) return { ok: false, message: "לא נבחר למי לתת גישה." };
  const courses = await db.select({ id: course.id, status: course.status }).from(course).where(inArray(course.id, input.courseIds));
  if (!courses.length || courses.length !== new Set(input.courseIds).size) return { ok: false, message: "אחד הקורסים לא נמצא." };
  if (courses.some((c) => c.status !== "published")) return { ok: false, message: "אפשר לתת גישה רק לקורסים שפורסמו." };
  const rows = subjects.flatMap((s) =>
    input.courseIds.map((courseId) => ({ id: randomUUID(), courseId, ...s, validFrom: input.validFrom, validUntil: input.validUntil, note: input.note?.slice(0, 200) || null, createdBy: actorId })),
  );
  await db.transaction(async (tx) => {
    await tx.insert(courseAccess).values(rows);
    await tx.insert(auditLog).values({
      actorId,
      action: "access.grant",
      entity: input.orgId ? "organization" : "user",
      entityId: input.orgId ?? (input.userIds?.length === 1 ? input.userIds[0]! : null),
      details: { courseIds: input.courseIds, users: input.userIds?.length ?? 0, validFrom: input.validFrom, validUntil: input.validUntil },
    });
  });
  return { ok: true, created: rows.length };
}

export async function updateGrant(actorId: string, id: string, patch: { validUntil?: string | null; revoke?: boolean }): Promise<{ ok: true } | { ok: false; message: string }> {
  const [g] = await db.select().from(courseAccess).where(eq(courseAccess.id, id));
  if (!g) return { ok: false, message: "ההרשאה לא נמצאה." };
  if (patch.revoke) {
    await db.update(courseAccess).set({ revokedAt: new Date() }).where(eq(courseAccess.id, id));
  } else if (patch.validUntil !== undefined) {
    if (patch.validUntil && (!DATE_RE.test(patch.validUntil) || patch.validUntil < g.validFrom)) return { ok: false, message: "תאריך סיום לא תקין." };
    await db.update(courseAccess).set({ validUntil: patch.validUntil, revokedAt: null }).where(eq(courseAccess.id, id));
  }
  await db.insert(auditLog).values({ actorId, action: patch.revoke ? "access.revoke" : "access.update", entity: "course_access", entityId: id, details: patch });
  return { ok: true };
}

export interface GrantRow {
  id: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  subjectKind: "org" | "user";
  subjectId: string;
  validFrom: string;
  validUntil: string | null;
  state: AccessState;
}

async function grantRows(where: ReturnType<typeof eq>): Promise<GrantRow[]> {
  const [today, rows] = await Promise.all([
    todayIL(),
    db
      .select({ g: courseAccess, courseTitle: course.title, orgName: organization.name, userName: user.name, userEmail: user.email })
      .from(courseAccess)
      .innerJoin(course, eq(course.id, courseAccess.courseId))
      .leftJoin(organization, eq(organization.id, courseAccess.orgId))
      .leftJoin(user, eq(user.id, courseAccess.userId))
      .where(where)
      .orderBy(desc(courseAccess.createdAt)),
  ]);
  return rows.map((r) => ({
    id: r.g.id,
    courseId: r.g.courseId,
    courseTitle: r.courseTitle,
    subject: r.g.orgId ? `ארגון: ${r.orgName}` : `${r.userName} (${r.userEmail})`,
    subjectKind: r.g.orgId ? "org" : "user",
    subjectId: (r.g.orgId ?? r.g.userId)!,
    validFrom: r.g.validFrom,
    validUntil: r.g.validUntil,
    state: stateOf(r.g, today),
  }));
}

export const grantsForOrg = (orgId: string) => grantRows(eq(courseAccess.orgId, orgId));
export const grantsForUser = (userId: string) => grantRows(eq(courseAccess.userId, userId));
export const grantsForCourse = (courseId: string) => grantRows(eq(courseAccess.courseId, courseId));

/* ───────────── Bulk people ───────────── */

export async function usersByEmail(emails: string[]) {
  if (!emails.length) return [];
  return db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(inArray(user.email, emails));
}

export async function publishedCourseOptions() {
  return db.select({ id: course.id, title: course.title }).from(course).where(and(eq(course.status, "published"))).orderBy(asc(course.title));
}

