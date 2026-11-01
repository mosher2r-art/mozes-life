import type { Metadata } from "next";
import Link from "next/link";
import { can, ROLE_LABELS_HE } from "@mozes/authz";
import { NewUserForm } from "@/components/admin/forms";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { listOrgs, listUsers } from "@/server/admin-users";

export const metadata: Metadata = { title: "משתמשים" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getCurrentUser();
  if (!can(me?.actor, "users.manage_platform")) return <Forbidden />;
  const { q = "" } = await searchParams;
  const [users, orgs] = await Promise.all([listUsers(q.slice(0, 100)), listOrgs()]);
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">ניהול</p>
        <h1 className="page-title">משתמשים</h1>
      </header>
      <NewUserForm orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
      <form className="search" role="search">
        <label htmlFor="user-q" className="visually-hidden">חיפוש משתמש</label>
        <input id="user-q" name="q" defaultValue={q} placeholder="חיפוש לפי שם או אימייל" />
        <button className="btn btn-quiet btn-sm" type="submit">חיפוש</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">שם</th><th scope="col">אימייל</th><th scope="col">תפקיד</th><th scope="col">ארגון</th><th scope="col">מצב</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <th scope="row"><Link className="table-title" href={`/studio/users/${u.id}`}>{u.name}</Link></th>
                <td dir="ltr" className="muted">{u.email}</td>
                <td>{[...u.roles.map((r) => ROLE_LABELS_HE[r]), ...u.orgs.map((o) => ROLE_LABELS_HE[o.role])].join(" · ") || "—"}</td>
                <td>{u.orgs.map((o) => o.name).join(", ") || "—"}</td>
                <td>{u.disabled ? <span className="chip chip-fail">מושבת</span> : <span className="chip chip-done">פעיל</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="muted">לא נמצאו משתמשים.</p>}
    </div>
  );
}
