import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@mozes/authz";
import { Editor } from "@/components/editor/Editor";
import { Forbidden } from "@/components/Forbidden";
import { contentHash } from "@/lib/content-hash";
import { getCurrentUser } from "@/server/actor";
import { getEditorData } from "@/server/studio-courses";

export const metadata: Metadata = { title: "עורך הלומדות" };
export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const data = await getEditorData(id);
  if (!data) notFound();
  return (
    <Editor
      courseId={data.id}
      initial={data.content}
      revision={data.revision}
      published={data.status === "published"}
      latestVersion={data.latestVersion}
      unpublishedChanges={data.publishedHash !== null && contentHash(data.content) !== data.publishedHash}
      canEdit={can(user?.actor, "course.edit")}
      canPublish={can(user?.actor, "course.publish")}
    />
  );
}
