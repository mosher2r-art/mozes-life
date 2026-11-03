import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@mozes/authz";
import { Course } from "@mozes/content-schema";
import { CourseBuilder } from "@/components/course/CourseBuilder";
import { Forbidden } from "@/components/Forbidden";
import { PackageCourseView } from "@/components/import/PackageCourseView";
import { ReportView } from "@/components/import/ReportView";
import { collectAssetIds } from "@/lib/collect-assets";
import { getCurrentUser } from "@/server/actor";
import { listChapters } from "@/server/chapters";
import type { AnalysisReport } from "@/server/import/analyze";
import { launchUrlFor } from "@/server/importer";
import { resolveVersionedAssets as resolveAssets } from "@/server/media-v2";
import { getCourseBuilder, getPackageCourse } from "@/server/studio-courses";

export const metadata: Metadata = { title: "בניית קורס" };
export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const pkg = await getPackageCourse(id);
  if (pkg) {
    return (
      <PackageCourseView
        courseId={id}
        title={pkg.c.title}
        launchUrl={pkg.p ? launchUrlFor(pkg.p.id) : null}
        latestVersion={pkg.v?.versionNo ?? null}
        canPublish={can(user?.actor, "course.publish")}
        canEdit={can(user?.actor, "course.edit")}
        revision={pkg.c.builderRevision}
        certificateEnabled={pkg.c.certificateEnabled}
        report={pkg.p ? <ReportView report={pkg.p.report as AnalysisReport} /> : null}
      />
    );
  }
  const data = await getCourseBuilder(id);
  if (!data) notFound();
  const parsed = Course.safeParse(data.composed);
  const [media, bank] = await Promise.all([resolveAssets(parsed.success ? collectAssetIds(parsed.data) : []), listChapters()]);
  return (
    <div className="page">
      <CourseBuilder
        courseId={data.id}
        title={data.title}
        isDemo={data.isDemo}
        revision={data.revision}
        certificateEnabled={data.certificateEnabled}
        passingScore={data.passingScore}
        chapters={data.chapters}
        missing={data.missing}
        composed={data.composed}
        latestVersion={data.latestVersion}
        unpublishedChanges={data.unpublishedChanges}
        bank={bank.map((b) => ({ id: b.id, title: b.title, kind: b.kind, screens: b.screens, questions: b.questions }))}
        media={media}
        canEdit={can(user?.actor, "course.edit")}
        canCreate={can(user?.actor, "course.create")}
        canPublish={can(user?.actor, "course.publish")}
        canAssign={can(user?.actor, "org.manage")}
      />
    </div>
  );
}
