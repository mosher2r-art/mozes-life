import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, ROLE_LABELS_HE } from "@mozes/authz";
import { GrantForm, GrantTable, PeopleImport } from "@/components/admin/access";
import { OrgMemberForm, RemoveMemberButton, SeatLimitForm } from "@/components/admin/forms";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { grantsForOrg, publishedCourseOptions } from "@/server/access";
import { getOrg, ORG_TYPE_LABEL, seatUsage } from "@/server/admin-users";

export const metadata: Metadata = { title: "ארגון" };
export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!can(me?.actor, "org.manage")) return <Forbidden />;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const data = await getOrg(id);
  if (!data) notFound();
  const [courses, grants, seats] = await Promise.all([publishedCourseOptions(), grantsForOrg(id), seatUsage(id)]);
  return (
    <div className="page">
      <header className="page-head">
        <Link href="/studio/orgs" className="ed-back">→ ארגונים</Link>
        <p className="kicker">{ORG_TYPE_LABEL[data.org.type]}</p>
        <h1 className="page-title">{data.org.name}</h1>
      </header>
      <section className="stack-sm" aria-labelledby="org-courses">
        <h2 id="org-courses" className="section-title">קורסים לארגון</h2>
        <p className="muted">הגישה חלה על כל חברי הארגון — גם על מי שיצטרף אחר כך — בתקופה שנקבעה.</p>
        <GrantTable grants={grants} />
        <GrantForm courses={courses} orgId={id} title="מתן גישה לקורסים" />
      </section>
      <section className="stack-sm" aria-labelledby="org-members">
        <h2 id="org-members" className="section-title">חברי הארגון ({data.members.length})</h2>
        <div className="split-even">
          <PeopleImport orgId={id} title="הוספת רשימת אנשים" />
          <div className="stack-sm">
            <OrgMemberForm orgId={id} />
            <SeatLimitForm orgId={id} limit={seats.limit} used={seats.used} />
          </div>
        </div>
        <p className="muted">מנהלי הארגון רואים את ההתקדמות ומנהלים חברים בכתובת <span dir="ltr">/org</span>.</p>
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">שם</th><th scope="col">אימייל</th><th scope="col">תפקיד</th><th scope="col"><span className="visually-hidden">פעולות</span></th></tr></thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id}>
                <th scope="row"><Link className="table-title" href={`/studio/users/${m.id}`}>{m.name}</Link>{m.disabled && <span className="chip chip-fail">מושבת</span>}</th>
                <td dir="ltr" className="muted">{m.email}</td>
                <td>{ROLE_LABELS_HE[m.role]}</td>
                <td className="table-actions"><RemoveMemberButton orgId={id} userId={m.id} name={m.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.members.length === 0 && <p className="muted">אין עדיין חברים בארגון.</p>}
    </div>
  );
}
