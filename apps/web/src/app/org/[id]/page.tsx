import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { can } from "@mozes/authz";
import { PeopleImport } from "@/components/admin/access";
import { Forbidden } from "@/components/Forbidden";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { getCurrentUser } from "@/server/actor";
import { seatUsage } from "@/server/admin-users";
import { orgReport } from "@/server/org-portal";
import { OrgMemberActions } from "./OrgMemberActions";

export const metadata: Metadata = { title: "ניהול הארגון" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { t: string; c: string }> = {
  not_started: { t: "טרם התחיל", c: "chip-neutral" },
  in_progress: { t: "בתהליך", c: "chip-progress" },
  completed: { t: "הושלם", c: "chip-done" },
  passed: { t: "עבר", c: "chip-done" },
  failed: { t: "לא עבר", c: "chip-fail" },
};
const fmt = (d: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`));

export default async function OrgDashboard({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  if (!can(user?.actor, "org.view_progress", { orgId: id })) return <Forbidden />;
  const [[org], report, seats] = await Promise.all([db.select().from(organization).where(eq(organization.id, id)), orgReport(id), seatUsage(id)]);
  if (!org) notFound();
  const canManage = can(user?.actor, "org.manage_members", { orgId: id });
  const learners = report.members.length;
  const done = Object.values(report.progress).flatMap((byCourse) => Object.values(byCourse)).filter((p) => p.status === "passed" || p.status === "completed").length;
  const certs = Object.values(report.progress).flatMap((byCourse) => Object.values(byCourse)).filter((p) => p.certificate).length;

  return (
    <div className="academy-stack">
      <header className="academy-hello">
        <p className="kicker">ניהול הארגון</p>
        <h1 className="academy-title">{org.name}</h1>
      </header>

      <section aria-label="סיכום" className="academy-stats">
        <div><span className="num">{seats.limit ? `${learners}/${seats.limit}` : learners}</span><span>{seats.limit ? "משתמשים מתוך המכסה" : "משתמשים"}</span></div>
        <div><span className="num">{report.courses.filter((c) => c.state === "active").length}</span><span>קורסים פעילים</span></div>
        <div><span className="num">{done}</span><span>השלמות</span></div>
        <div><span className="num">{certs}</span><span>תעודות</span></div>
      </section>

      <section className="academy-section" aria-labelledby="org-c">
        <h2 id="org-c" className="section-title">קורסים</h2>
        {report.courses.length === 0 ? (
          <p className="muted">עדיין לא הוגדרו קורסים לארגון. לרכישת קורסים פנו ל-MOZES LIFE.</p>
        ) : (
          <ul className="cert-list">
            {report.courses.map((c) => {
              const started = report.members.filter((m) => report.progress[m.id]?.[c.id] && report.progress[m.id]![c.id]!.status !== "not_started").length;
              const finished = report.members.filter((m) => ["passed", "completed"].includes(report.progress[m.id]?.[c.id]?.status ?? "")).length;
              return (
                <li key={c.id}>
                  <span className="cert-list-title">{c.title}</span>
                  <span className="muted">התחילו {started} · סיימו {finished} מתוך {learners}</span>
                  <span className="muted">{c.state === "active" ? (c.validUntil ? `גישה עד ${fmt(c.validUntil)}` : "ללא הגבלת זמן") : c.state === "scheduled" ? `ייפתח ב-${fmt(c.validFrom)}` : "הגישה הסתיימה"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="academy-section" aria-labelledby="org-m">
        <div className="section-head">
          <h2 id="org-m" className="section-title">התקדמות חברי הארגון</h2>
          {learners > 0 && report.courses.length > 0 && <a className="btn btn-quiet btn-sm" href={`/api/org/${id}/report.csv`}>הורדת דוח לאקסל</a>}
        </div>
        {learners === 0 ? (
          <p className="muted">עדיין אין חברים בארגון.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">שם</th>
                  {report.courses.map((c) => <th key={c.id} scope="col">{c.title}</th>)}
                  {canManage && <th scope="col"><span className="visually-hidden">פעולות</span></th>}
                </tr>
              </thead>
              <tbody>
                {report.members.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <span className="table-title">{m.name}</span>
                      <span className="muted org-email" dir="ltr">{m.email}</span>
                      {m.role === "org_admin" && <span className="chip chip-neutral">מנהל/ת</span>}
                    </th>
                    {report.courses.map((c) => {
                      const p = report.progress[m.id]?.[c.id];
                      const st = STATUS[p?.status ?? "not_started"]!;
                      return (
                        <td key={c.id}>
                          <span className={`chip ${st.c}`}>{st.t}</span>
                          {p && p.status !== "not_started" && <span className="num muted"> {p.progress}%{p.score !== null ? ` · ציון ${p.score}` : ""}</span>}
                          {p?.certificate && <a className="org-cert" href={`/certificates/${p.certificate}`}>תעודה</a>}
                        </td>
                      );
                    })}
                    {canManage && (
                      <td className="table-actions">{m.id !== user!.actor.userId && <OrgMemberActions orgId={id} userId={m.id} name={m.name} email={m.email} />}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className="academy-section">
          <PeopleImport orgId={id} endpoint={`/api/org/${id}/people`} title="הוספת אנשים לארגון" />
          {seats.limit !== null && <p className="muted">נותרו {Math.max(0, seats.limit - seats.used)} מקומות במכסה.</p>}
        </section>
      )}
    </div>
  );
}
