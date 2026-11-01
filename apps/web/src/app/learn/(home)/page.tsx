import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/actor";
import { ensureCertificates, listMyCertificates } from "@/server/certificates";
import { listMyCourses, type MyCourse } from "@/server/learning";

export const metadata: Metadata = { title: "הקורסים שלי" };
export const dynamic = "force-dynamic";

const STATUS: Record<MyCourse["status"], { label: string; tone: string; cta: string }> = {
  not_started: { label: "טרם התחיל", tone: "neutral", cta: "התחלת הקורס" },
  in_progress: { label: "בתהליך", tone: "progress", cta: "המשך ללמוד" },
  completed: { label: "הושלם", tone: "done", cta: "צפייה חוזרת" },
  passed: { label: "עבר בהצלחה", tone: "done", cta: "צפייה חוזרת" },
  failed: { label: "לא עבר", tone: "fail", cta: "צפייה חוזרת" },
};

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="course-progress">
      <div className="course-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="course-progress-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="num">{value}%</span>
    </div>
  );
}

function Cover({ c }: { c: MyCourse }) {
  return (
    <div className="course-cover">
      {c.coverUrl ? <img src={c.coverUrl} alt="" /> : null}
      {c.isDemo && <span className="course-demo">הדגמה · לא רפואי</span>}
    </div>
  );
}

export default async function MyCourses() {
  const user = await getCurrentUser();
  if (user) await ensureCertificates(user.actor.userId);
  const [courses, certs] = user ? await Promise.all([listMyCourses(user.actor.userId), listMyCertificates(user.actor.userId)]) : [[], []];
  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";
  const current = courses.find((c) => c.status === "in_progress");
  const done = courses.filter((c) => ["completed", "passed"].includes(c.status));
  const certificates = certs.length;

  return (
    <div className="academy-stack">
      <header className="academy-hello">
        <p className="kicker">MOZES LIFE Academy</p>
        <h1 className="academy-title">שלום, {firstName}</h1>
        <p className="muted">לומדים להציל חיים — בקצב שלך, מכל מכשיר.</p>
      </header>

      {current && (
        <section className="resume" aria-labelledby="resume-title">
          <Cover c={current} />
          <div className="resume-body">
            <p className="kicker kicker-green">ממשיכים מאיפה שעצרת</p>
            <h2 id="resume-title" className="resume-title">{current.title}</h2>
            <Progress value={current.progressPercent} label={`התקדמות בקורס ${current.title}`} />
            <Link className="btn btn-primary resume-cta" href={`/learn/c/${current.enrollmentId}`}>
              המשך ללמוד
            </Link>
          </div>
        </section>
      )}

      <section aria-label="סיכום" className="academy-stats">
        <div><span className="num">{courses.length}</span><span>קורסים</span></div>
        <div><span className="num">{courses.filter((c) => c.status === "in_progress").length}</span><span>בתהליך</span></div>
        <div><span className="num">{done.length}</span><span>הושלמו</span></div>
        <div><span className="num">{certificates}</span><span>תעודות</span></div>
      </section>

      <section aria-labelledby="my-courses" className="academy-section">
        <h2 id="my-courses" className="section-title">הקורסים שלי</h2>
        {courses.length === 0 ? (
          <div className="academy-empty" role="status">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 24h9l4-9 6 18 5-12 3 3h13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="academy-empty-title">עדיין לא שויכו אליך קורסים</p>
            <p>כשהארגון שלך יעניק לך גישה לקורס, הוא יופיע כאן ותוכל/י להתחיל ללמוד מיד.</p>
          </div>
        ) : (
          <ul className="course-grid">
            {courses.map((c) => {
              const st = STATUS[c.status];
              return (
                <li key={c.enrollmentId} className="course-card">
                  <Cover c={c} />
                  <div className="course-card-body">
                    <div className="course-meta">
                      <span className={`chip chip-${st.tone}`}>{st.label}</span>
                      {c.estimatedMinutes && <span className="muted num">כ-{c.estimatedMinutes} דקות</span>}
                    </div>
                    <h3 className="course-title">{c.title}</h3>
                    <p className="course-summary">{c.summary}</p>
                    {c.status !== "not_started" && <Progress value={c.progressPercent} label={`התקדמות בקורס ${c.title}`} />}
                    {c.scorePercent !== null && c.status !== "in_progress" && <p className="muted">ציון: <span className="num">{c.scorePercent}%</span></p>}
                    <Link className={`btn ${c.status === "in_progress" || c.status === "not_started" ? "btn-primary" : "btn-quiet"}`} href={`/learn/c/${c.enrollmentId}`}>
                      {st.cta}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="certs" className="academy-section">
        <h2 id="certs" className="section-title">תעודות</h2>
        {certs.length ? (
          <ul className="cert-list">
            {certs.map((c) => (
              <li key={c.id}>
                <span className="cert-list-title">{c.courseTitle}</span>
                <a className="btn btn-quiet btn-sm" href={`/certificates/${c.code}`}>צפייה בתעודה</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">תעודה מונפקת אוטומטית בסיום מוצלח של קורס. קורסי הדגמה אינם מזכים בתעודה.</p>
        )}
      </section>
    </div>
  );
}
