import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { isOrgRole, isPlatformRole, type OrgRole, type PlatformRole } from "@mozes/authz";
import { db } from "@/db";
import { account, auditLog, course, membership, organization, session, user, userPlatformRole } from "@/db/schema";

/** Readable temporary password (no look-alike characters). */
export function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 12; i++) p += chars[randomInt(chars.length)];
  return p;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  createdAt: Date;
  roles: PlatformRole[];
  orgs: { id: string; name: string; role: OrgRole }[];
}

export async function listUsers(query = ""): Promise<UserRow[]> {
  const q = query.trim().toLowerCase();
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email, disabled: user.disabled, createdAt: user.createdAt })
    .from(user)
    .where(q ? sql`lower(${user.name}) like ${"%" + q + "%"} or lower(${user.email}) like ${"%" + q + "%"}` : undefined)
    .orderBy(asc(user.name))
    .limit(500);
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [roles, orgs] = await Promise.all([
    db.select().from(userPlatformRole).where(inArray(userPlatformRole.userId, ids)),
    db
      .select({ userId: membership.userId, id: organization.id, name: organization.name, role: membership.role })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(inArray(membership.userId, ids)),
  ]);
  return users.map((u) => ({
    ...u,
    roles: roles.filter((r) => r.userId === u.id).map((r) => r.role),
    orgs: orgs.filter((o) => o.userId === u.id).map(({ id, name, role }) => ({ id, name, role })),
  }));
}

export async function getUser(id: string): Promise<UserRow | null> {
  const [u] = await db.select({ id: user.id, name: user.name, email: user.email, disabled: user.disabled, createdAt: user.createdAt }).from(user).where(eq(user.id, id));
  if (!u) return null;
  const [roles, orgs] = await Promise.all([
    db.select().from(userPlatformRole).where(eq(userPlatformRole.userId, id)),
    db.select({ id: organization.id, name: organization.name, role: membership.role }).from(membership).innerJoin(organization, eq(organization.id, membership.orgId)).where(eq(membership.userId, id)),
  ]);
  return { ...u, roles: roles.map((r) => r.role), orgs };
}

export type CreateUserInput = { name: string; email: string; password?: string; roles: string[]; orgId?: string; orgRole?: string };

export async function createUser(actorId: string, input: CreateUserInput): Promise<{ ok: true; id: string; password: string } | { ok: false; message: string }> {
  const email = input.email.trim().toLowerCase();
  const roles = input.roles.filter(isPlatformRole);
  const password = input.password || generatePassword();
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: problem };
  if (input.orgRole && !isOrgRole(input.orgRole)) return { ok: false, message: "תפקיד בארגון לא תקין." };
  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (exists) return { ok: false, message: "כבר קיים משתמש עם האימייל הזה." };
  if (input.orgId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, input.orgId));
    if (!org) return { ok: false, message: "הארגון לא נמצא." };
  }
  const id = randomUUID();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, email, name: input.name.trim(), emailVerified: true });
    await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    for (const role of roles) await tx.insert(userPlatformRole).values({ userId: id, role, grantedBy: actorId });
    if (input.orgId) await tx.insert(membership).values({ orgId: input.orgId, userId: id, role: (input.orgRole as OrgRole) ?? "learner" });
    await tx.insert(auditLog).values({ actorId, action: "user.create", entity: "user", entityId: id, details: { email, roles, orgId: input.orgId ?? null } });
  });
  return { ok: true, id, password };
}

const revokeSessions = (userId: string) => db.delete(session).where(eq(session.userId, userId));

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Checks an administrator-chosen password. Returns a Hebrew reason, or null when acceptable. */
export function passwordProblem(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `הסיסמה צריכה להכיל לפחות ${PASSWORD_MIN} תווים.`;
  if (p.length > PASSWORD_MAX) return "הסיסמה ארוכה מדי.";
  if (p.trim() !== p) return "הסיסמה לא יכולה להתחיל או להסתיים ברווח.";
  return null;
}

/**
 * Sets a new password: the one the administrator typed, or a random one. Signs the user out everywhere.
 * The password itself is never logged.
 */
export async function resetPassword(actorId: string, userId: string, chosen?: string): Promise<{ ok: true; password: string } | { ok: false; reason: "not_found" | "invalid"; message?: string }> {
  if (chosen !== undefined) {
    const problem = passwordProblem(chosen);
    if (problem) return { ok: false, reason: "invalid", message: problem };
  }
  const password = chosen ?? generatePassword();
  const hash = await hashPassword(password);
  const r = await db.update(account).set({ password: hash }).where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).returning({ id: account.id });
  if (!r.length) return { ok: false, reason: "not_found" };
  await revokeSessions(userId);
  await db.insert(auditLog).values({ actorId, action: "user.reset_password", entity: "user", entityId: userId, details: { manual: chosen !== undefined } });
  return { ok: true, password };
}

export async function setRoles(actorId: string, userId: string, roles: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const next = [...new Set(roles.filter(isPlatformRole))];
  if (actorId === userId && !next.includes("super_admin")) return { ok: false, message: "אי אפשר להסיר מעצמך את הרשאת מנהל המערכת." };
  await db.transaction(async (tx) => {
    await tx.delete(userPlatformRole).where(eq(userPlatformRole.userId, userId));
    for (const role of next) await tx.insert(userPlatformRole).values({ userId, role, grantedBy: actorId });
    await tx.insert(auditLog).values({ actorId, action: "user.set_roles", entity: "user", entityId: userId, details: { roles: next } });
  });
  return { ok: true };
}

export async function setDisabled(actorId: string, userId: string, disabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actorId === userId) return { ok: false, message: "אי אפשר להשבית את החשבון שלך." };
  const r = await db.update(user).set({ disabled }).where(eq(user.id, userId)).returning({ id: user.id });
  if (!r.length) return { ok: false, message: "המשתמש לא נמצא." };
  if (disabled) await revokeSessions(userId);
  await db.insert(auditLog).values({ actorId, action: disabled ? "user.disable" : "user.enable", entity: "user", entityId: userId });
  return { ok: true };
}

/* ───────────── Organizations ───────────── */

/** Seats used = members of the organization (any role). */
export async function seatUsage(orgId: string): Promise<{ used: number; limit: number | null }> {
  const [org] = await db.select({ limit: organization.seatLimit }).from(organization).where(eq(organization.id, orgId));
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(membership).where(eq(membership.orgId, orgId));
  return { used: n?.n ?? 0, limit: org?.limit ?? null };
}

export async function setSeatLimit(actorId: string, orgId: string, limit: number | null): Promise<void> {
  await db.update(organization).set({ seatLimit: limit }).where(eq(organization.id, orgId));
  await db.insert(auditLog).values({ actorId, action: "org.set_seats", entity: "organization", entityId: orgId, details: { limit } });
}

const seatsMessage = (limit: number, used: number, adding: number) =>
  `חריגה ממכסת המשתמשים של הארגון: ${used} מתוך ${limit} בשימוש, וניסיתם להוסיף ${adding}. פנו ל-MOZES LIFE להגדלת המכסה.`;

export const ORG_TYPES = ["company", "institution", "building", "private"] as const;
export const ORG_TYPE_LABEL: Record<(typeof ORG_TYPES)[number], string> = { company: "חברה", institution: "מוסד", building: "בניין מגורים", private: "פרטי" };

export async function listOrgs() {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      type: organization.type,
      status: organization.status,
      seatLimit: organization.seatLimit,
      members: sql<number>`(select count(*)::int from ${membership} where ${membership.orgId} = ${organization.id})`,
    })
    .from(organization)
    .orderBy(asc(organization.name));
}

export async function createOrg(actorId: string, name: string, type: (typeof ORG_TYPES)[number]): Promise<string> {
  const id = randomUUID();
  await db.insert(organization).values({ id, name: name.trim(), type });
  await db.insert(auditLog).values({ actorId, action: "org.create", entity: "organization", entityId: id, details: { name } });
  return id;
}

export async function getOrg(id: string) {
  const [org] = await db.select().from(organization).where(eq(organization.id, id));
  if (!org) return null;
  const members = await db
    .select({ id: user.id, name: user.name, email: user.email, role: membership.role, disabled: user.disabled })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.orgId, id))
    .orderBy(asc(user.name));
  return { org, members };
}

export async function addMember(actorId: string, orgId: string, email: string, role: OrgRole): Promise<{ ok: true } | { ok: false; message: string }> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
  if (!u) return { ok: false, message: "לא נמצא משתמש עם האימייל הזה. צרו אותו קודם במסך המשתמשים." };
  const [already] = await db.select({ u: membership.userId }).from(membership).where(and(eq(membership.orgId, orgId), eq(membership.userId, u.id)));
  if (!already) {
    const seats = await seatUsage(orgId);
    if (seats.limit !== null && seats.used + 1 > seats.limit) return { ok: false, message: seatsMessage(seats.limit, seats.used, 1) };
  }
  await db.insert(membership).values({ orgId, userId: u.id, role }).onConflictDoUpdate({ target: [membership.orgId, membership.userId], set: { role } });
  await db.insert(auditLog).values({ actorId, action: "org.add_member", entity: "organization", entityId: orgId, details: { email, role } });
  return { ok: true };
}

export async function removeMember(actorId: string, orgId: string, userId: string): Promise<void> {
  await db.delete(membership).where(and(eq(membership.orgId, orgId), eq(membership.userId, userId)));
  await db.insert(auditLog).values({ actorId, action: "org.remove_member", entity: "organization", entityId: orgId, details: { userId } });
}

export async function publishedCourses() {
  return db.select({ id: course.id, title: course.title }).from(course).where(eq(course.status, "published")).orderBy(asc(course.title));
}

/* ───────────── Bulk people ───────────── */

export interface BulkResult {
  line: number;
  name: string;
  email: string;
  status: "created" | "existing" | "invalid";
  password?: string;
  raw?: string;
}

/**
 * Adds a pasted list of people in one go: creates missing accounts (with temporary passwords),
 * adds everyone to the organization, or — for private learners — grants them the chosen courses.
 */
export async function bulkPeople(
  actorId: string,
  input: { text: string; orgId?: string; courseIds?: string[]; validFrom?: string; validUntil?: string | null },
): Promise<{ ok: true; results: BulkResult[]; granted: number } | { ok: false; message: string }> {
  const { parsePeople, usersByEmail, grantAccess } = await import("./access");
  const { people, invalid } = parsePeople(input.text);
  if (!people.length && !invalid.length) return { ok: false, message: "הרשימה ריקה." };
  if (people.length > 1000) return { ok: false, message: "אפשר להוסיף עד 1000 אנשים בכל פעם." };
  if (input.orgId) {
    const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, input.orgId));
    if (!org) return { ok: false, message: "הארגון לא נמצא." };
  }
  const existing = new Map((await usersByEmail(people.map((p) => p.email))).map((u) => [u.email, u]));
  if (input.orgId) {
    // All-or-nothing seat check before any account is created.
    const seats = await seatUsage(input.orgId);
    if (seats.limit !== null) {
      const memberIds = new Set((await db.select({ u: membership.userId }).from(membership).where(eq(membership.orgId, input.orgId))).map((m) => m.u));
      const adding = people.filter((p) => !memberIds.has(existing.get(p.email)?.id ?? "")).length;
      if (seats.used + adding > seats.limit) return { ok: false, message: seatsMessage(seats.limit, seats.used, adding) };
    }
  }
  const results: BulkResult[] = invalid.map((i) => ({ line: i.line, name: "", email: "", status: "invalid", raw: i.raw }));
  const userIds: string[] = [];
  for (const p of people) {
    const found = existing.get(p.email);
    if (found) {
      userIds.push(found.id);
      results.push({ line: p.line, name: found.name, email: p.email, status: "existing" });
    } else {
      const r = await createUser(actorId, { name: p.name, email: p.email, roles: [] });
      if (!r.ok) {
        results.push({ line: p.line, name: p.name, email: p.email, status: "invalid", raw: r.message });
        continue;
      }
      userIds.push(r.id);
      results.push({ line: p.line, name: p.name, email: p.email, status: "created", password: r.password });
    }
  }
  if (input.orgId && userIds.length) {
    await db
      .insert(membership)
      .values(userIds.map((userId) => ({ orgId: input.orgId!, userId, role: "learner" as const })))
      .onConflictDoNothing({ target: [membership.orgId, membership.userId] });
  }
  let granted = 0;
  if (!input.orgId && input.courseIds?.length && userIds.length) {
    const g = await grantAccess(actorId, { courseIds: input.courseIds, userIds, validFrom: input.validFrom!, validUntil: input.validUntil ?? null });
    if (!g.ok) return g;
    granted = g.created;
  }
  await db.insert(auditLog).values({ actorId, action: "people.bulk_add", entity: input.orgId ? "organization" : "user", entityId: input.orgId ?? null, details: { added: userIds.length, created: results.filter((r) => r.status === "created").length } });
  return { ok: true, results: results.sort((a, b) => a.line - b.line), granted };
}
