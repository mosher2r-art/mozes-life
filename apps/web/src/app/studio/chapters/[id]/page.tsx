import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@mozes/authz";
import { ChapterEditor } from "@/components/editor/ChapterEditor";
import { Forbidden } from "@/components/Forbidden";
import { collectAssetIds } from "@/lib/collect-assets";
import { getCurrentUser } from "@/server/actor";
import { getChapter } from "@/server/chapters";
import { resolveVersionedAssets as resolveAssets } from "@/server/media-v2";

export const metadata: Metadata = { title: "עריכת פרק" };
export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const ch = await getChapter(id);
  if (!ch) notFound();
  const media = await resolveAssets(collectAssetIds(ch.content), ch.draftAssetPins ?? {});
  return (
    <ChapterEditor
      chapterId={ch.id}
      initial={ch.content}
      revision={ch.revision}
      usedIn={ch.usedIn}
      canEdit={can(user?.actor, "course.edit")}
      canManageMedia={can(user?.actor, "media.manage")}
      canReview={can(user?.actor,"medical.review")}
      canPublish={can(user?.actor,"course.publish")}
      media={media}
    />
  );
}
