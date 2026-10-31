import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: "לוח בקרה" };
export const dynamic = "force-dynamic";

// Honest roadmap status — informational, not interactive.
const ROADMAP: { phase: string; name: string; status: "done" | "next" | "planned" }[] = [
  { phase: "0", name: "תשתית, התחברות והרשאות", status: "done" },
  { phase: "1", name: "מנוע תוכן, בדיקת תקינות ונגן", status: "done" },
  { phase: "2", name: "עורך הלומדות וניהול קורסים", status: "next" },
  { phase: "3", name: "מרכז ייבוא לומדות", status: "planned" },
  { phase: "4", name: "לומדים, ארגונים, רישיונות ותעודות", status: "planned" },
];
const STATUS = { done: "הושלם", next: "השלב הבא", planned: "מתוכנן" } as const;

async function stats() {
  try {
    const r = await db.execute<{ users: number; orgs: number }>(
      sql`select (select count(*) from "user")::int as users, (select count(*) from organization)::int as orgs`,
    );
    return { ok: true as const, ...r.rows[0]! };
  } catch {
    return { ok: false as const };
  }
}

export default async function StudioDashboard() {
  const [user, s] = await Promise.all([getCurrentUser(), stats()]);
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">{today}</p>
        <h1 className="page-title">שלום, {user?.name}</h1>
      </header>

      <section aria-label="נתוני מערכת" className="metrics">
        <div className="metric">
          <span className="metric-label">בסיס נתונים</span>
          <span className={`metric-value status-dot ${s.ok ? "is-ok" : "is-bad"}`}>{s.ok ? "מחובר" : "לא זמין"}</span>
        </div>
        <div className="metric">
          <span className="metric-label">משתמשים</span>
          <span className="metric-value num">{s.ok ? s.users : "—"}</span>
        </div>
        <div className="metric">
          <span className="metric-label">ארגונים</span>
          <span className="metric-value num">{s.ok ? s.orgs : "—"}</span>
        </div>
        <div className="metric">
          <span className="metric-label">קורסים מפורסמים</span>
          <span className="metric-value num">0</span>
        </div>
      </section>

      <div className="split">
        <section className="block" aria-labelledby="roadmap">
          <div className="block-head">
            <h2 id="roadmap">שלבי פיתוח</h2>
          </div>
          <ol className="roadmap">
            {ROADMAP.map((r) => (
              <li key={r.phase} className={`roadmap-item is-${r.status}`}>
                <span className="roadmap-phase">{r.phase}</span>
                <span className="roadmap-name">{r.name}</span>
                <span className="roadmap-status">{STATUS[r.status]}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="block block-feature" aria-labelledby="try">
          <p className="kicker kicker-green">זמין עכשיו</p>
          <h2 id="try">הדגמת הנגן</h2>
          <p className="muted">כל תשע תבניות המסך, שאלות, תרחיש עם הסתעפות ובדיקת תקינות — כפי שהלומדים יראו אותם, בתצוגת נייד ומחשב.</p>
          <Link href="/studio/preview/demo" className="btn btn-dark">
            פתיחת ההדגמה
          </Link>
        </section>
      </div>
    </div>
  );
}
