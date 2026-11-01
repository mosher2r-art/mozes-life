import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ───────────── Authentication (Better Auth core tables) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────────── Roles & organizations ───────────── */

export const platformRole = pgEnum("platform_role", [
  "super_admin",
  "content_admin",
  "editor",
  "medical_reviewer",
]);

export const orgRole = pgEnum("org_role", ["org_admin", "learner"]);

export const orgType = pgEnum("org_type", ["private", "company", "institution", "building"]);

/** Staff roles. A user may hold several. */
export const userPlatformRole = pgTable(
  "user_platform_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: platformRole("role").notNull(),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: orgType("type").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  ...timestamps,
});

export const membership = pgTable(
  "membership",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("membership_user_idx").on(t.userId)],
);

/* ───────────── Audit ───────────── */

/** Append-only. Application code must never UPDATE or DELETE rows here. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

/* ───────────── Courses & learning ───────────── */

export const courseStatus = pgEnum("course_status", ["draft", "published", "archived"]);

export const course = pgTable("course", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  /** Public path or asset URL of the cover image. */
  coverUrl: text("cover_url"),
  estimatedMinutes: integer("estimated_minutes"),
  status: courseStatus("status").notNull().default("draft"),
  /** Marks non-production demo content so it is never sold or certified. */
  isDemo: boolean("is_demo").notNull().default(false),
  publishedVersionId: text("published_version_id"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Immutable snapshot of course content at publish time. */
export const courseVersion = pgTable(
  "course_version",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    content: jsonb("content").notNull(),
    contentHash: text("content_hash").notNull(),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_version_no_idx").on(t.courseId, t.versionNo)],
);

export const enrollmentStatus = pgEnum("enrollment_status", ["not_started", "in_progress", "completed", "passed", "failed"]);

export const enrollment = pgTable(
  "enrollment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    /** Pinned at first launch; a later publish does not change an attempt in progress. */
    courseVersionId: text("course_version_id").references(() => courseVersion.id, { onDelete: "restrict" }),
    status: enrollmentStatus("status").notNull().default("not_started"),
    progressPercent: integer("progress_percent").notNull().default(0),
    scorePercent: integer("score_percent"),
    /** player-core state, produced server-side by replaying learner events. */
    state: jsonb("state"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("enrollment_user_course_idx").on(t.userId, t.courseId), index("enrollment_user_idx").on(t.userId)],
);
