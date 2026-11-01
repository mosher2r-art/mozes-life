import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@mozes/authz";
import { NewOrgForm } from "@/components/admin/forms";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { listOrgs, ORG_TYPE_LABEL } from "@/server/admin-users";

export const metadata: Metadata = { title: "ארגונים" };
export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  const me = await getCurrentUser();
  if (!can(me?.actor, "org.manage")) return <Forbidden />;
  const orgs = await listOrgs();
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">ניהול</p>
        <h1 className="page-title">ארגונים</h1>
        <p className="muted">חברות, מוסדות ובנייני מגורים. אפשר לשייך ארגון שלם לקורס בפעולה אחת.</p>
      </header>
      <NewOrgForm />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">ארגון</th><th scope="col">סוג</th><th scope="col">משתמשים</th></tr></thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <th scope="row"><Link className="table-title" href={`/studio/orgs/${o.id}`}>{o.name}</Link></th>
                <td>{ORG_TYPE_LABEL[o.type]}</td>
                <td className="num">{o.seatLimit ? `${o.members} / ${o.seatLimit}` : o.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
