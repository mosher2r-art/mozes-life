/**
 * Publishes the NON-MEDICAL technical demo course and enrolls users in it.
 *   pnpm demo:publish --enroll learner@example.com --enroll other@example.com
 * Idempotent: re-running publishes a new version only when the content changed.
 */
import { createHash, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { validateCourse } from "@mozes/validator";
import { demoCourse } from "../src/content/demo-course";
import * as schema from "../src/db/schema";

const { values } = parseArgs({ options: { enroll: { type: "string", multiple: true } } });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const result = validateCourse(demoCourse);
if (!result.ok || !result.course) {
  console.error(result.issues.filter((i) => i.severity === "error"));
  throw new Error("Demo course failed validation; not publishing");
}
const content = result.course;
const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
const COURSE_ID = "demo-player";

try {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.course)
      .values({
        id: COURSE_ID,
        slug: "demo-player",
        title: "הדגמת נגן MOZES LIFE",
        summary: "קורס הדגמה טכני שמציג את כל סוגי המסכים והאינטראקציות. אינו תוכן רפואי.",
        coverUrl: "/demo/scene.jpg",
        estimatedMinutes: 5,
        status: "published",
        isDemo: true,
      })
      .onConflictDoNothing();

    const [latest] = await tx
      .select()
      .from(schema.courseVersion)
      .where(eq(schema.courseVersion.courseId, COURSE_ID))
      .orderBy(desc(schema.courseVersion.versionNo))
      .limit(1);

    let versionId = latest?.id;
    if (!latest || latest.contentHash !== hash) {
      versionId = randomUUID();
      await tx.insert(schema.courseVersion).values({
        id: versionId,
        courseId: COURSE_ID,
        versionNo: (latest?.versionNo ?? 0) + 1,
        content,
        contentHash: hash,
      });
      console.log(`Published demo course version ${(latest?.versionNo ?? 0) + 1}`);
    } else console.log("Demo course unchanged");
    await tx.update(schema.course).set({ publishedVersionId: versionId, status: "published" }).where(eq(schema.course.id, COURSE_ID));

    for (const email of values.enroll ?? []) {
      const [u] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email.toLowerCase()));
      if (!u) throw new Error(`No user ${email}`);
      const existing = await tx
        .select({ id: schema.enrollment.id })
        .from(schema.enrollment)
        .where(and(eq(schema.enrollment.userId, u.id), eq(schema.enrollment.courseId, COURSE_ID)));
      if (!existing.length) {
        await tx.insert(schema.enrollment).values({ id: randomUUID(), userId: u.id, courseId: COURSE_ID });
        console.log(`Enrolled ${email}`);
      }
    }
  });
} finally {
  await pool.end();
}
