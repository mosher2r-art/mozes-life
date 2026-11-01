import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { certificate, course, enrollment, user } from "@/db/schema";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => `ML-${Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/**
 * Issues certificates for this learner's successful enrollments in courses that grant one.
 * "Successful" is decided by the course version itself: passed when it requires a score, otherwise completed.
 * Name, course title and score are snapshotted so the certificate never changes afterwards.
 */
export async function ensureCertificates(userId: string): Promise<void> {
  const due = await db
    .select({ enrollmentId: enrollment.id, courseId: course.id, courseTitle: course.title, score: enrollment.scorePercent, learnerName: user.name })
    .from(enrollment)
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .innerJoin(user, eq(user.id, enrollment.userId))
    .leftJoin(certificate, eq(certificate.enrollmentId, enrollment.id))
    .where(and(eq(enrollment.userId, userId), inArray(enrollment.status, ["passed", "completed"]), eq(course.isDemo, false), eq(course.certificateEnabled, true), isNull(certificate.id)));
  for (const d of due) {
    await db
      .insert(certificate)
      .values({ id: randomUUID(), code: newCode(), enrollmentId: d.enrollmentId, userId, courseId: d.courseId, learnerName: d.learnerName, courseTitle: d.courseTitle, scorePercent: d.score })
      .onConflictDoNothing({ target: certificate.enrollmentId });
  }
}

export async function listMyCertificates(userId: string) {
  return db.select().from(certificate).where(eq(certificate.userId, userId)).orderBy(desc(certificate.issuedAt));
}

export async function getCertificateByCode(code: string) {
  if (!/^ML-[A-Z0-9]{10}$/.test(code)) return null;
  const [c] = await db.select().from(certificate).where(eq(certificate.code, code));
  return c ?? null;
}
