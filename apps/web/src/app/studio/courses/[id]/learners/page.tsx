import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { can } from "@mozes/authz";
import { GrantForm, GrantTable, PeopleImport } from "@/components/admin/access";
import { Forbidden } from "@/components/Forbidden";
import { db } from "@/db";
import { course } from "@/db/schema";
import { getCurrentUser } from "@/server/actor";
import { grantsForCourse } from "@/server/access";
import { listOrgs } from "@/server/admin-users";
import { listCourseLearners } from "@/server/studio-courses";

export const metadata: Metadata = { title: "גישה ולומדים" };
export const dynamic = "force-dynamic";

const STATUS = { not_started: "טרם התחיל", in_progress: "בתהליך", completed: "הושלם", passed: "עבר", failed: "לא עבר" } as const;

export default async function LearnersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "org.manage")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const [c] = await db.select({ title: course.title, status: course.status }).from(course).where(eq(course.id, id));
  if (!c) notFound();
  const [learners, grants, orgs] = await Promise.all([listCourseLearners(id), grantsForCourse(id), listOrgs()]);
  const published = c.status === "published";
  return (
    <div className="page">
      <header className="page-head">
        <Link href="/studio/courses" className="ed-back">→ קורסים</Link>
        <p className="kicker">{c.title}</p>
        <h1 className="page-title">גישה ולומדים</h1>
      </header>
      {!published ? (
        <p className="notice">אפשר לתת גישה רק אחרי שהקורס פורסם.</p>
      ) : (
        <div className="split-even">
          <PeopleImport courses={[{ id, title: c.title }]} title="לומדים פרטיים — הדבקת רשימה" />
          <GrantForm courses={[{ id, title: c.title }]} fixedCourseId={id} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} title="גישה לארגון שלם" />
        </div>
      )}
      <section className="stack-sm" aria-labelledby="c-grants">
        <h2 id="c-grants" className="section-title">הרשאות גישה</h2>
        <GrantTable grants={grants} showSubject showCourse={false} />
      </section>
      <section className="stack-sm" aria-labelledby="c-learners">
        <h2 id="c-learners" className="section-title">התקדמות לומדים ({learners.length})</h2>
        {learners.length === 0 ? (
          <p className="muted">עדיין אין לומדים שהתחילו את הקורס.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">שם</th><th scope="col">אימייל</th><th scope="col">מצב</th><th scope="col">התקדמות</th><th scope="col">ציון</th></tr></thead>
              <tbody>
                {learners.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">{l.name}</th>
                    <td dir="ltr" className="muted">{l.email}</td>
                    <td>{STATUS[l.status]}</td>
                    <td className="num">{l.progress}%</td>
                    <td className="num">{l.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
