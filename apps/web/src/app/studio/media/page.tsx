import type { Metadata } from "next";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
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
      <MediaLibrary mode="manage" canManage={can(user?.actor, "media.manage")} />
    </div>
  );
}
