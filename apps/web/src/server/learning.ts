import type { ResolvedMedia } from "@mozes/player-react";
import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Course } from "@mozes/content-schema";
import { EngineError, type PlayerEvent, type PlayerState, reconcile, start, step, summarize } from "@mozes/player-core";
import { db } from "@/db";
import { collectAssetIds } from "@/lib/collect-assets";
import { course, courseVersion, enrollment, user } from "@/db/schema";
import { accessByCourse, type CourseAccessSummary, ensureEnrollments, hasActiveAccess } from "./access";
import { launchUrlFor } from "./importer";
import { resolveAssets } from "./media";
import { resolveVersionedAssets } from "./media-v2";

export interface MyCourse {
  /** null while access is only scheduled (no progress record yet). */
  enrollmentId: string | null;
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
  access: CourseAccessSummary;
}

/**
 * Courses this learner has (or had, or will have) access to. Progress records are created for
 * every course that is open today; expired and upcoming access is shown but cannot be opened.
 */
export async function listMyCourses(userId: string): Promise<MyCourse[]> {
  await ensureEnrollments(userId);
  const access = await accessByCourse(userId);
  if (!access.size) return [];
  const rows = await db
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
  const list: MyCourse[] = rows.filter((r) => access.has(r.courseId)).map((r) => ({ ...r, access: access.get(r.courseId)! }));
  const enrolled = new Set(list.map((c) => c.courseId));
  const upcoming = [...access.entries()].filter(([id, a]) => !enrolled.has(id) && a.state === "scheduled").map(([id]) => id);
  if (upcoming.length) {
    const extra = await db.select().from(course).where(and(inArray(course.id, upcoming), eq(course.status, "published")));
    for (const c of extra) {
      list.push({
        enrollmentId: null, courseId: c.id, title: c.title, summary: c.summary, coverUrl: c.coverUrl, estimatedMinutes: c.estimatedMinutes, isDemo: c.isDemo,
        status: "not_started", progressPercent: 0, scorePercent: null, lastActivityAt: null, completedAt: null, access: access.get(c.id)!,
      });
    }
  }
  const order = { active: 0, scheduled: 1, expired: 2, revoked: 3 } as const;
  return list.sort((a, b) => order[a.access.state] - order[b.access.state]);
}

export interface LaunchData {
  kind: "native";
  enrollmentId: string;
  title: string;
  isDemo: boolean;
  content: Course;
  state: PlayerState;
  media: Record<string, ResolvedMedia>;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Loads (and pins, on first launch) the published version for a learner's own enrollment. */
async function loadPinned(tx: Tx, userId: string, enrollmentId: string) {
  const [row] = await tx
    .select({ e: enrollment, c: course })
    .from(enrollment)
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .where(and(eq(enrollment.id, enrollmentId), eq(enrollment.userId, userId), eq(course.status, "published")))
    .for("update", { of: enrollment });
  if (!row) return null;
  // Access is checked on every launch and every save — not only when the course list is shown.
  if (!(await hasActiveAccess(tx, userId, row.c.id))) return null;

  let versionId = row.e.courseVersionId;
  if (!versionId) {
    if (!row.c.publishedVersionId) return null;
    versionId = row.c.publishedVersionId;
    await tx.update(enrollment).set({ courseVersionId: versionId }).where(eq(enrollment.id, enrollmentId));
  }
  const [version] = await tx.select().from(courseVersion).where(eq(courseVersion.id, versionId));
  if (!version) return null;
  return { row, version };
}

async function loadForUpdate(tx: Tx, userId: string, enrollmentId: string) {
  const pinned = await loadPinned(tx, userId, enrollmentId);
  if (!pinned || pinned.row.c.kind !== "native") return null;
  const { row, version } = pinned;
  const content = Course.parse(version.content);
  const state = row.e.state ? reconcile(content, row.e.state as PlayerState) : start(content);
  return { row, content, state, assetManifest: version.assetManifest };
}

export async function getLaunchData(userId: string, enrollmentId: string): Promise<LaunchData | PackageLaunch | null> {
  const pkg = await getPackageLaunch(userId, enrollmentId);
  if (pkg) return pkg;
  const data = await db.transaction(async (tx) => {
    const loaded = await loadForUpdate(tx, userId, enrollmentId);
    if (!loaded) return null;
    return { kind: "native" as const, enrollmentId, title: loaded.row.c.title, isDemo: loaded.row.c.isDemo, content: loaded.content, state: loaded.state, assetManifest: loaded.assetManifest };
  });
  if (!data) return null;
  return { ...data, media: data.content.schemaVersion === 2 ? await resolveVersionedAssets(collectAssetIds(data.content), data.assetManifest, enrollmentId) : await resolveAssets(collectAssetIds(data.content)) };
}

/* ───────────── Imported packages (SCORM / HTML5) ───────────── */

export const PackageDescriptor = z.object({ kind: z.literal("package"), packageId: z.string(), format: z.enum(["scorm12", "scorm2004", "html5"]) });
type Descriptor = z.infer<typeof PackageDescriptor>;
type Cmi = Record<string, string>;

export interface PackageLaunch {
  kind: "package";
  enrollmentId: string;
  title: string;
  format: Descriptor["format"];
  launchUrl: string;
  cmi: Cmi;
  learner: { id: string; name: string };
  status: (typeof enrollment.$inferSelect)["status"];
}

async function getPackageLaunch(userId: string, enrollmentId: string): Promise<PackageLaunch | null> {
  return db.transaction(async (tx) => {
    const pinned = await loadPinned(tx, userId, enrollmentId);
    if (!pinned || pinned.row.c.kind !== "package") return null;
    const d = PackageDescriptor.parse(pinned.version.content);
    const launchUrl = launchUrlFor(d.packageId);
    if (!launchUrl) return null;
    const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
    const saved = (pinned.row.e.state as { cmi?: Cmi } | null)?.cmi ?? {};
    return {
      kind: "package",
      enrollmentId,
      title: pinned.row.c.title,
      format: d.format,
      launchUrl,
      cmi: saved,
      learner: { id: userId, name: u?.name ?? "" },
      status: pinned.row.e.status,
    };
  });
}

const num = (v: string | undefined) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Maps SCORM data to an enrollment status. Note: with SCORM the courseware itself reports
 * completion and score from the learner's browser — the LMS cannot verify them independently.
 */
export function deriveFromCmi(format: Descriptor["format"], cmi: Cmi, manualComplete: boolean) {
  if (format === "html5") return { status: manualComplete ? ("completed" as const) : ("in_progress" as const), score: null, progress: manualComplete ? 100 : 10 };
  if (format === "scorm12") {
    const st = (cmi["cmi.core.lesson_status"] ?? "").toLowerCase();
    const raw = num(cmi["cmi.core.score.raw"]);
    const max = num(cmi["cmi.core.score.max"]) ?? 100;
    const min = num(cmi["cmi.core.score.min"]) ?? 0;
    const score = raw === null ? null : Math.round(((raw - min) / Math.max(1, max - min)) * 100);
    const status = st === "passed" ? "passed" : st === "failed" ? "failed" : st === "completed" ? "completed" : "in_progress";
    return { status: status as "passed" | "failed" | "completed" | "in_progress", score, progress: status === "in_progress" ? 50 : 100 };
  }
  const completion = (cmi["cmi.completion_status"] ?? "").toLowerCase();
  const success = (cmi["cmi.success_status"] ?? "").toLowerCase();
  const scaled = num(cmi["cmi.score.scaled"]);
  const raw = num(cmi["cmi.score.raw"]);
  const max = num(cmi["cmi.score.max"]);
  const score = scaled !== null ? Math.round(scaled * 100) : raw !== null && max ? Math.round((raw / max) * 100) : null;
  const measure = num(cmi["cmi.progress_measure"]);
  const status = success === "passed" ? "passed" : success === "failed" ? "failed" : completion === "completed" ? "completed" : "in_progress";
  return { status: status as "passed" | "failed" | "completed" | "in_progress", score, progress: status === "in_progress" ? Math.min(99, Math.round((measure ?? 0.5) * 100)) : 100 };
}

export const CmiPayload = z
  .object({
    cmi: z.record(z.string().regex(/^cmi\.[A-Za-z0-9_.]{1,120}$/), z.string().max(65_000)).refine((o) => Object.keys(o).length <= 2000, "too many fields"),
    complete: z.boolean().optional(),
  })
  .strict();

export async function savePackageData(userId: string, enrollmentId: string, cmi: Cmi, complete: boolean): Promise<boolean> {
  if (JSON.stringify(cmi).length > 300_000) return false;
  return db.transaction(async (tx) => {
    const pinned = await loadPinned(tx, userId, enrollmentId);
    if (!pinned || pinned.row.c.kind !== "package") return false;
    const d = PackageDescriptor.parse(pinned.version.content);
    const prev = (pinned.row.e.state as { cmi?: Cmi; manualComplete?: boolean } | null) ?? {};
    const manualComplete = !!prev.manualComplete || (d.format === "html5" && complete);
    const s = deriveFromCmi(d.format, cmi, manualComplete);
    const now = new Date();
    // Never downgrade a finished attempt (e.g. a later "incomplete" from re-opening the course).
    const finished = ["passed", "completed", "failed"].includes(pinned.row.e.status);
    await tx
      .update(enrollment)
      .set({
        state: { packageId: d.packageId, cmi, manualComplete },
        status: finished && s.status === "in_progress" ? pinned.row.e.status : s.status,
        progressPercent: finished ? Math.max(pinned.row.e.progressPercent, s.progress) : s.progress,
        scorePercent: s.score ?? pinned.row.e.scorePercent,
        startedAt: pinned.row.e.startedAt ?? now,
        lastActivityAt: now,
        completedAt: s.status === "in_progress" ? pinned.row.e.completedAt : (pinned.row.e.completedAt ?? now),
      })
      .where(eq(enrollment.id, enrollmentId));
    return true;
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
