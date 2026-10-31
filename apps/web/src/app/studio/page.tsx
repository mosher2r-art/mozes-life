import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: "לוח בקרה" };
export const dynamic = "force-dynamic";

// Real, honest roadmap status — informational text, not interactive controls.
const MODULES: { name: string; status: "active" | "next" | "planned" }[] = [
  { name: "התחברות והרשאות", status: "active" },
  { name: "ניהול קורסים", status: "next" },
  { name: "עורך הלומדות", status: "next" },
  { name: "מרכז ייבוא לומדות", status: "planned" },
  { name: "ספריית מדיה", status: "planned" },
  { name: "משתמשים וארגונים", status: "planned" },
  { name: "רישיונות וגישה", status: "planned" },
  { name: "תוצאות, התקדמות ותעודות", status: "planned" },
  { name: "הגדרות מערכת", status: "planned" },
];
const STATUS_LABEL = { active: "פעיל", next: "בפיתוח בשלב הבא", planned: "מתוכנן" } as const;

async function dbStatus(): Promise<{ ok: boolean; users?: number }> {
  try {
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from "user"`);
    return { ok: true, users: r.rows[0]?.n ?? 0 };
  } catch {
    return { ok: false };
  }
}

export default async function StudioDashboard() {
  const [user, status] = await Promise.all([getCurrentUser(), dbStatus()]);
  return (
    <div className="stack">
      <h1>שלום {user?.name}</h1>
      <section className="panel" aria-labelledby="sys">
        <h2 id="sys">מצב המערכת</h2>
        <dl className="kv">
          <dt>בסיס נתונים</dt>
          <dd className={status.ok ? "ok" : "bad"}>{status.ok ? "מחובר" : "לא זמין"}</dd>
          {status.ok && (
            <>
              <dt>משתמשים רשומים</dt>
              <dd>{status.users}</dd>
            </>
          )}
        </dl>
      </section>
      <section className="panel" aria-labelledby="mods">
        <h2 id="mods">מודולים</h2>
        <ul className="modules">
          {MODULES.map((m) => (
            <li key={m.name}>
              <span>{m.name}</span>
              <span className={`badge badge-${m.status}`}>{STATUS_LABEL[m.status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
