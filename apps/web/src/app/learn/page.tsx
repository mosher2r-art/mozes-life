import type { Metadata } from "next";

export const metadata: Metadata = { title: "הקורסים שלי" };

export default function MyCourses() {
  // Courses & enrollments arrive in a later phase; until then this is the true state.
  return (
    <div className="academy-stack">
      <div>
        <p className="kicker">MOZES LIFE Academy</p>
        <h1 className="academy-title">הקורסים שלי</h1>
      </div>
      <div className="academy-empty" role="status">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 24h9l4-9 6 18 5-12 3 3h13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="academy-empty-title">עדיין לא שויכו אליך קורסים</p>
        <p>כשהארגון שלך יעניק לך גישה לקורס, הוא יופיע כאן ותוכל/י להתחיל ללמוד מיד.</p>
      </div>
    </div>
  );
}
