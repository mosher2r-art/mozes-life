import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { db } from "@/db";
import { course } from "@/db/schema";
import { getCurrentUser } from "@/server/actor";
import { listCourseLearners } from "@/server/studio-courses";
import { EnrollForm } from "./EnrollForm";

export const metadata: Metadata = { title: "לומדים בקורס" };
export const dynamic = "force-dynamic";

const STATUS = { not_started: "טרם התחיל", in_progress: "בתהליך", completed: "הושלם", passed: "עבר", failed: "לא עבר" } as const;

export default async function LearnersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.publish")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const [c] = await db.select({ title: course.title, status: course.status }).from(course).where(eq(course.id, id));
  if (!c) notFound();
  const learners = await listCourseLearners(id);
  return (
    <div className="page">
      <header className="page-head">
        <Link href="/studio/courses" className="ed-back">→ קורסים</Link>
        <p className="kicker">{c.title}</p>
        <h1 className="page-title">לומדים בקורס</h1>
      </header>
      {c.status === "published" ? <EnrollForm courseId={id} /> : <p className="notice">אפשר לשייך לומדים רק אחרי שהקורס פורסם.</p>}
      {learners.length === 0 ? (
        <div className="block"><p className="muted">עדיין לא שויכו לומדים לקורס.</p></div>
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
      <p className="muted">ללומד צריך להיות חשבון במערכת. ניהול משתמשים והזמנות במייל יתווספו בהמשך.</p>
    </div>
  );
}
