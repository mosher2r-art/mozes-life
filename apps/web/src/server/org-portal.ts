import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { certificate, course, courseAccess, enrollment, membership, organization, user } from "@/db/schema";
import { stateOf, todayIL } from "./access";

/** Organizations this user administers. */
export async function adminOrgs(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(and(eq(membership.userId, userId), eq(membership.role, "org_admin")))
    .orderBy(asc(organization.name));
}

export interface OrgReport {
  courses: { id: string; title: string; validFrom: string; validUntil: string | null; state: string }[];
  members: { id: string; name: string; email: string; role: "org_admin" | "learner" }[];
  /** userId → courseId → progress */
  progress: Record<string, Record<string, { status: string; progress: number; score: number | null; certificate: string | null }>>;
}

/** Progress of every member in every course granted to the organization. */
export async function orgReport(orgId: string): Promise<OrgReport> {
  const [today, grants, members] = await Promise.all([
    todayIL(),
    db
      .select({ courseId: courseAccess.courseId, title: course.title, validFrom: courseAccess.validFrom, validUntil: courseAccess.validUntil, revokedAt: courseAccess.revokedAt })
      .from(courseAccess)
      .innerJoin(course, eq(course.id, courseAccess.courseId))
      .where(eq(courseAccess.orgId, orgId)),
    db
      .select({ id: user.id, name: user.name, email: user.email, role: membership.role })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.orgId, orgId))
      .orderBy(asc(user.name)),
  ]);
  // One row per course: the latest-ending grant.
  const byCourse = new Map<string, OrgReport["courses"][number]>();
  for (const g of grants) {
    const row = { id: g.courseId, title: g.title, validFrom: g.validFrom, validUntil: g.validUntil, state: stateOf(g, today) };
    const prev = byCourse.get(g.courseId);
    if (!prev || prev.state !== "active" || row.state === "active") byCourse.set(g.courseId, row);
  }
  const courseIds = [...byCourse.keys()];
  const memberIds = members.map((m) => m.id);
  const progress: OrgReport["progress"] = {};
  if (courseIds.length && memberIds.length) {
    const rows = await db
      .select({ userId: enrollment.userId, courseId: enrollment.courseId, status: enrollment.status, progress: enrollment.progressPercent, score: enrollment.scorePercent, code: certificate.code })
      .from(enrollment)
      .leftJoin(certificate, eq(certificate.enrollmentId, enrollment.id))
      .where(and(inArray(enrollment.userId, memberIds), inArray(enrollment.courseId, courseIds)));
    for (const r of rows) (progress[r.userId] ??= {})[r.courseId] = { status: r.status, progress: r.progress, score: r.score, certificate: r.code };
  }
  return { courses: [...byCourse.values()].sort((a, b) => a.title.localeCompare(b.title, "he")), members, progress };
}

/** Org admins may only manage accounts that belong to nobody else (no staff role, no other org). */
export async function canManageAccount(orgId: string, userId: string): Promise<boolean> {
  const memberships = await db.select({ orgId: membership.orgId }).from(membership).where(eq(membership.userId, userId));
  const { userPlatformRole } = await import("@/db/schema");
  const roles = await db.select({ r: userPlatformRole.role }).from(userPlatformRole).where(eq(userPlatformRole.userId, userId));
  return roles.length === 0 && memberships.length === 1 && memberships[0]!.orgId === orgId;
}
