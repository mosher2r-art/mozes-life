import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { can, ROLE_LABELS_HE } from "@mozes/authz";
import { UserActions } from "@/components/admin/forms";
import { Forbidden } from "@/components/Forbidden";
import { db } from "@/db";
import { course, enrollment } from "@/db/schema";
import { getCurrentUser } from "@/server/actor";
import { getUser } from "@/server/admin-users";

export const metadata: Metadata = { title: "פרטי משתמש" };
export const dynamic = "force-dynamic";
const STATUS = { not_started: "טרם התחיל", in_progress: "בתהליך", completed: "הושלם", passed: "עבר", failed: "לא עבר" } as const;

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!can(me?.actor, "users.manage_platform")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const u = await getUser(id);
  if (!u) notFound();
  const courses = await db
    .select({ title: course.title, status: enrollment.status, progress: enrollment.progressPercent, score: enrollment.scorePercent })
    .from(enrollment)
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .where(eq(enrollment.userId, id));
  return (
    <div className="page">
      <header className="page-head">
        <Link href="/studio/users" className="ed-back">→ משתמשים</Link>
        <h1 className="page-title">{u.name}</h1>
        <p className="muted" dir="ltr">{u.email}</p>
        <p>{u.disabled ? <span className="chip chip-fail">מושבת</span> : <span className="chip chip-done">פעיל</span>}</p>
      </header>
      <section className="block">
        <h2 className="form-title">ארגונים</h2>
        {u.orgs.length ? (
          <ul className="plain-list">{u.orgs.map((o) => <li key={o.id}><Link href={`/studio/orgs/${o.id}`}>{o.name}</Link> · {ROLE_LABELS_HE[o.role]}</li>)}</ul>
        ) : <p className="muted">לא משויך לארגון.</p>}
      </section>
      <section className="block">
        <h2 className="form-title">קורסים</h2>
        {courses.length ? (
          <ul className="plain-list">{courses.map((c, i) => <li key={i}>{c.title} · {STATUS[c.status]} · <span className="num">{c.progress}%</span>{c.score !== null ? ` · ציון ${c.score}` : ""}</li>)}</ul>
        ) : <p className="muted">לא משויך לקורסים.</p>}
      </section>
      <UserActions id={u.id} email={u.email} roles={u.roles} disabled={u.disabled} isSelf={u.id === me!.actor.userId} />
    </div>
  );
}
