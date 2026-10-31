import type { Metadata } from "next";

export const metadata: Metadata = { title: "הקורסים שלי" };

export default function MyCourses() {
  // Courses & enrollments arrive in a later phase; until then this is the true state.
  return (
    <div className="stack">
      <h1>הקורסים שלי</h1>
      <div className="empty-state" role="status">
        <p className="empty-title">עדיין לא שויכו אליך קורסים</p>
        <p>כשהארגון שלך יעניק לך גישה לקורס, הוא יופיע כאן.</p>
      </div>
    </div>
  );
}
