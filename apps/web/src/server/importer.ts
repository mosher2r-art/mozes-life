import "server-only";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, course, coursePackage, importJob } from "@/db/schema";
import { type AnalysisReport, analyzeZip, extractZip } from "./import/analyze";
import { launchPage, runtimeScript } from "./import/runtime";
import { createUpload, downloadToFile, driver, packageBaseUrl, putObject, remove, type UploadTarget } from "./storage";

export const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
const rid = (p: string) => `${p}-${randomBytes(8).toString("hex")}`;

export async function reserveImport(actorId: string, filename: string, size: number): Promise<{ ok: true; id: string; upload: UploadTarget } | { ok: false; message: string }> {
  if (driver() === "none") return { ok: false, message: "אחסון הקבצים עדיין לא הוגדר." };
  if (!/\.zip$/i.test(filename)) return { ok: false, message: "יש להעלות קובץ ZIP של הלומדה." };
  if (size <= 0) return { ok: false, message: "הקובץ ריק." };
  if (size > MAX_PACKAGE_BYTES) return { ok: false, message: "הקובץ גדול מדי. הגודל המרבי לחבילה הוא 500MB." };
  const id = rid("imp");
  const key = `imports/${id}.zip`;
  await db.insert(importJob).values({ id, filename: filename.slice(0, 200), sizeBytes: size, storageKey: key, createdBy: actorId });
  return { ok: true, id, upload: await createUpload(key, "application/zip", id, `/api/studio/import/${id}/content`) };
}

export async function getImport(id: string) {
  const [j] = await db.select().from(importJob).where(eq(importJob.id, id));
  return j ?? null;
}

export interface ImportView {
  id: string;
  filename: string;
  status: string;
  report: AnalysisReport | null;
  packageId: string | null;
  launchUrl: string | null;
}

export function launchUrlFor(packageId: string): string | null {
  const base = packageBaseUrl();
  return base ? `${base}/${packageId}/__mozes/launch.html` : null;
}

/**
 * Downloads the uploaded ZIP to a temp folder, analyses it, and — only if it is acceptable —
 * extracts it under packages/<id>/ together with the MOZES launch page.
 */
export async function analyseImport(actorId: string, id: string): Promise<ImportView | null> {
  const job = await getImport(id);
  if (!job) return null;
  if (job.status !== "uploading") return toView(job);

  const dir = await mkdtemp(path.join(tmpdir(), "mozes-import-"));
  const file = path.join(dir, "package.zip");
  try {
    let report: AnalysisReport;
    try {
      await downloadToFile(job.storageKey, file);
      const { size } = await stat(file);
      if (size !== job.sizeBytes || size > MAX_PACKAGE_BYTES) throw new Error("size");
      report = await analyzeZip(file);
    } catch {
      report = { verdict: "unsupported", format: null, title: "", launchPath: null, rootPrefix: "", fileCount: 0, totalBytes: 0, scoCount: 0, externalHosts: [], skipped: [], tracking: "", items: [{ severity: "error", code: "UPLOAD", message: "הקובץ לא התקבל במלואו. נסו להעלות שוב." }] };
    }

    if (report.verdict === "unsupported" || !report.format || !report.launchPath) {
      await db.update(importJob).set({ status: "rejected", report }).where(eq(importJob.id, id));
      await remove(job.storageKey).catch(() => undefined);
      return toView({ ...job, status: "rejected", report });
    }

    const packageId = rid("p");
    const prefix = `packages/${packageId}`;
    const { files, bytes } = await extractZip(file, report, (rel, stream, size, contentType) => putObject(`${prefix}/${rel}`, stream, size, contentType));
    const launchRel = report.launchPath.slice(report.rootPrefix.length);
    const html = Buffer.from(launchPage(report.format, launchRel), "utf8");
    await putObject(`${prefix}/__mozes/launch.html`, html, html.length, "text/html; charset=utf-8");
    const lib = await runtimeScript(report.format);
    if (lib) await putObject(`${prefix}/__mozes/${lib.name}`, lib.body, lib.body.length, "text/javascript; charset=utf-8");

    await db.insert(coursePackage).values({
      id: packageId,
      format: report.format,
      title: report.title || job.filename.replace(/\.zip$/i, ""),
      launchPath: launchRel,
      fileCount: files,
      totalBytes: bytes,
      report,
      createdBy: actorId,
    });
    await db.update(importJob).set({ status: "analysed", report, packageId }).where(eq(importJob.id, id));
    await db.insert(auditLog).values({ actorId, action: "import.analyse", entity: "package", entityId: packageId, details: { filename: job.filename, verdict: report.verdict, format: report.format, files } });
    return toView({ ...job, status: "analysed", report, packageId });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toView(job: typeof importJob.$inferSelect): ImportView {
  return {
    id: job.id,
    filename: job.filename,
    status: job.status,
    report: (job.report as AnalysisReport | null) ?? null,
    packageId: job.packageId,
    launchUrl: job.packageId ? launchUrlFor(job.packageId) : null,
  };
}

export async function viewImport(id: string): Promise<ImportView | null> {
  const job = await getImport(id);
  return job ? toView(job) : null;
}

/** Creates a draft course that offers the imported package. Publishing is a separate, explicit step. */
export async function createCourseFromImport(actorId: string, id: string, title: string): Promise<{ ok: true; courseId: string } | { ok: false; message: string }> {
  const job = await getImport(id);
  if (!job || job.status !== "analysed" || !job.packageId) return { ok: false, message: "החבילה לא נמצאה או שלא עברה בדיקה." };
  if (job.courseId) return { ok: true, courseId: job.courseId };
  const courseId = rid("c").slice(0, 20);
  await db.transaction(async (tx) => {
    await tx.insert(course).values({ id: courseId, slug: courseId, title, kind: "package", packageId: job.packageId, status: "draft", createdBy: actorId });
    await tx.update(importJob).set({ status: "imported", courseId }).where(eq(importJob.id, id));
    await tx.insert(auditLog).values({ actorId, action: "course.create_from_import", entity: "course", entityId: courseId, details: { importId: id, packageId: job.packageId } });
  });
  return { ok: true, courseId };
}

export async function recentImports(limit = 10) {
  return db.select().from(importJob).orderBy(desc(importJob.createdAt)).limit(limit);
}

export async function getPackage(id: string) {
  const [p] = await db.select().from(coursePackage).where(eq(coursePackage.id, id));
  return p ?? null;
}
