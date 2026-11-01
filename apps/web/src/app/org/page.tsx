import { redirect } from "next/navigation";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { adminOrgs } from "@/server/org-portal";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OrgIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await adminOrgs(user.actor.userId);
  if (orgs.length === 0) return <Forbidden />;
  if (orgs.length === 1) redirect(`/org/${orgs[0]!.id}`);
  return (
    <div className="academy-stack">
      <h1 className="academy-title">הארגונים שלי</h1>
      <ul className="cert-list">
        {orgs.map((o) => <li key={o.id}><span className="cert-list-title">{o.name}</span><Link className="btn btn-quiet btn-sm" href={`/org/${o.id}`}>ניהול</Link></li>)}
      </ul>
    </div>
  );
}
