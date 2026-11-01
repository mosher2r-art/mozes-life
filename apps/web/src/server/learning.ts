import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { Course } from "@mozes/content-schema";
import { EngineError, type PlayerEvent, type PlayerState, reconcile, start, step, summarize } from "@mozes/player-core";
import { db } from "@/db";
import { course, courseVersion, enrollment } from "@/db/schema";

export interface MyCourse {
  enrollmentId: string;
  courseId: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  estimatedMinutes: number | null;
  isDemo: boolean;
  status: (typeof enrollment.$inferSelect)["status"];
  progressPercent: number;
  scorePercent: number | null;
  lastActivityAt: Date | null;
  completedAt: Date | null;
}

/** Courses the learner is enrolled in (published courses only). */
export async function listMyCourses(userId: string): Promise<MyCourse[]> {
  return db
    .select({
      enrollmentId: enrollment.id,
      courseId: course.id,
      title: course.title,
      summary: course.summary,
      coverUrl: course.coverUrl,
      estimatedMinutes: course.estimatedMinutes,
      isDemo: course.isDemo,
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
      scorePercent: enrollment.scorePercent,
      lastActivityAt: enrollment.lastActivityAt,
      completedAt: enrollment.completedAt,
    })
    .from(enrollment)
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .where(and(eq(enrollment.userId, userId), eq(course.status, "published")))
    .orderBy(desc(sql`coalesce(${enrollment.lastActivityAt}, ${enrollment.createdAt})`));
}

export interface LaunchData {
  enrollmentId: string;
  title: string;
  isDemo: boolean;
  content: Course;
  state: PlayerState;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Loads (and pins, on first launch) the course version for a learner's own enrollment. */
async function loadForUpdate(tx: Tx, userId: string, enrollmentId: string) {
  const [row] = await tx
    .select({ e: enrollment, c: course })
    .from(enrollment)
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .where(and(eq(enrollment.id, enrollmentId), eq(enrollment.userId, userId), eq(course.status, "published")))
    .for("update", { of: enrollment });
  if (!row) return null;

  let versionId = row.e.courseVersionId;
  if (!versionId) {
    if (!row.c.publishedVersionId) return null;
    versionId = row.c.publishedVersionId;
    await tx.update(enrollment).set({ courseVersionId: versionId }).where(eq(enrollment.id, enrollmentId));
  }
  const [version] = await tx.select().from(courseVersion).where(eq(courseVersion.id, versionId));
  if (!version) return null;

  const content = Course.parse(version.content);
  const state = row.e.state ? reconcile(content, row.e.state as PlayerState) : start(content);
  return { row, content, state };
}

export async function getLaunchData(userId: string, enrollmentId: string): Promise<LaunchData | null> {
  return db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, userId, enrollmentId);
    if (!loaded) return null;
    return {
      enrollmentId,
      title: loaded.row.c.title,
      isDemo: loaded.row.c.isDemo,
      content: loaded.content,
      state: loaded.state,
    };
  });
}

export type ApplyResult =
  | { ok: true; state: PlayerState }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "rejected"; state: PlayerState; code: string };

/**
 * Replays learner events on the server with the same pure engine the browser uses.
 * Progress, score and completion are derived here — never trusted from the client.
 */
export async function applyEvents(userId: string, enrollmentId: string, events: PlayerEvent[]): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, userId, enrollmentId);
    if (!loaded) return { ok: false, reason: "not_found" } as const;

    let state = loaded.state;
    let rejected: string | null = null;
    for (const event of events) {
      try {
        state = step(loaded.content, state, event);
      } catch (e) {
        rejected = e instanceof EngineError ? e.code : "INVALID_EVENT";
        break; // keep everything applied so far; the client resyncs from the returned state
      }
    }

    const s = summarize(loaded.content, state);
    const now = new Date();
    const status = s.status === "in_progress" ? "in_progress" : s.status;
    await tx
      .update(enrollment)
      .set({
        state,
        status,
        progressPercent: s.progressPercent,
        scorePercent: s.scorePercent,
        startedAt: loaded.row.e.startedAt ?? now,
        lastActivityAt: now,
        completedAt: status === "in_progress" ? loaded.row.e.completedAt : (loaded.row.e.completedAt ?? now),
      })
      .where(eq(enrollment.id, enrollmentId));

    return rejected ? ({ ok: false, reason: "rejected", state, code: rejected } as const) : ({ ok: true, state } as const);
  });
}
