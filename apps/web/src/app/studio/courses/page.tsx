import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { listCourses } from "@/server/studio-courses";
import { NewCourseForm } from "./NewCourseForm";

export const metadata: Metadata = { title: "קורסים" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export default async function CoursesPage() {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  const courses = await listCourses();
  const canCreate = can(user?.actor, "course.create");
  const canAssign = can(user?.actor, "org.manage");

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">ניהול תוכן</p>
        <h1 className="page-title">קורסים</h1>
        <p className="muted">קורס בנוי מפרקים שבוחרים מ<Link href="/studio/chapters">מאגר הפרקים</Link>: שיעורים ומבחנים, בסדר שתקבעו. בקורס אפשר להגדיר תעודה וציון עובר.</p>
      </header>
      {canCreate && <NewCourseForm />}
      {canCreate && (
        <p className="muted">
          יש לכם לומדה מוכנה (SCORM או HTML5)? <Link href="/studio/import">ייבוא לומדה</Link>
        </p>
      )}
      {courses.length === 0 ? (
        <div className="block"><p className="muted">עדיין אין קורסים. צרו את הקורס הראשון למעלה.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">קורס</th>
                <th scope="col">מצב</th>
                <th scope="col">פרקים</th>
                <th scope="col">גרסה מפורסמת</th>
                <th scope="col">לומדים</th>
                <th scope="col">עדכון אחרון</th>
                <th scope="col"><span className="visually-hidden">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <Link href={`/studio/courses/${c.id}`} className="table-title">{c.title}</Link>
                    {c.isDemo && <span className="chip chip-neutral">הדגמה</span>}
                    {c.kind === "package" && <span className="chip chip-neutral">לומדה מיובאת</span>}
                    {c.certificateEnabled && !c.isDemo && <span className="chip chip-done">תעודה</span>}
                  </th>
                  <td>
                    {c.status === "published" ? (
                      <span className={`chip ${c.unpublishedChanges ? "chip-progress" : "chip-done"}`}>{c.unpublishedChanges ? "פורסם · יש שינויים" : "פורסם"}</span>
                    ) : (
                      <span className="chip chip-neutral">טיוטה</span>
                    )}
                  </td>
                  <td className="num">{c.kind === "package" ? "—" : c.chapters}</td>
                  <td className="num">{c.latestVersion ?? "—"}</td>
                  <td className="num">{c.learners}</td>
                  <td className="muted">{fmt.format(c.updatedAt)}</td>
                  <td className="table-actions">
                    <Link href={`/studio/courses/${c.id}`} className="btn btn-quiet btn-sm">בניית הקורס</Link>
                    {canAssign && c.status === "published" && <Link href={`/studio/courses/${c.id}/learners`} className="btn btn-quiet btn-sm">גישה ולומדים</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
