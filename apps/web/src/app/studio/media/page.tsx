import type { Metadata } from "next";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { MediaRequestsPanel } from "@/components/media/MediaRequestsPanel";
import { DeviceModelManager } from "@/components/media/DeviceModelManager";
import { MediaLibrary } from "@/components/media/MediaLibrary";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: "ספריית מדיה" };

export default async function MediaPage() {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">ניהול תוכן</p>
        <h1 className="page-title">ספריית מדיה</h1>
        <p className="muted">סרטונים, תמונות, קובצי שמע וכתוביות לשימוש בקורסים. כל קובץ נבדק לפני שהוא נשמר.</p>
      </header>
      <MediaRequestsPanel canEdit={can(user?.actor,"course.edit")} canManage={can(user?.actor,"media.manage")} canReview={can(user?.actor,"medical.review")} />
      <DeviceModelManager canManage={can(user?.actor,"media.manage")} canReview={can(user?.actor,"medical.review")} />
      <MediaLibrary mode="manage" canManage={can(user?.actor, "media.manage")} canReview={can(user?.actor,"medical.review")} />
    </div>
  );
}
