import type { Metadata } from "next";
import { can } from "@mozes/authz";
import { TECHNICAL_ONLY_NOTICE, validateCourse } from "@mozes/validator";
import { Forbidden } from "@/components/Forbidden";
import { demoCourse } from "@/content/demo-course";
import { getCurrentUser } from "@/server/actor";
import { DemoPlayer } from "./DemoPlayer";

export const metadata: Metadata = { title: "הדגמת נגן" };

const SEVERITY_LABEL = { error: "שגיאה", warning: "אזהרה", info: "מידע" } as const;

export default async function DemoPreviewPage() {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;

  const result = validateCourse(demoCourse);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of result.issues) counts[i.severity]++;

  return (
    <div className="stack">
      <div className="preview-head">
        <h1>הדגמת נגן</h1>
        <p className="muted">
          קורס הדגמה טכני, לא רפואי, שמציג את כל סוגי המסכים והאינטראקציות. זהו הנגן שהלומדים יראו.
        </p>
      </div>

      <section className="panel" aria-labelledby="validation-title">
        <h2 id="validation-title">בדיקת תקינות</h2>
        <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
        <p>
          {result.ok ? "הקורס תקין טכנית." : "נמצאו שגיאות שחוסמות פרסום."} שגיאות: {counts.error} · אזהרות: {counts.warning} · מידע: {counts.info}
        </p>
        {result.issues.length > 0 && (
          <ul className="issues">
            {result.issues.map((i, n) => (
              <li key={n} className={`issue issue-${i.severity}`}>
                <span className="issue-sev">{SEVERITY_LABEL[i.severity]}</span>
                <span>{i.message}</span>
                {i.screenId && <code dir="ltr">{i.screenId}</code>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.course ? (
        <section className="preview-frame" aria-label="תצוגת הנגן">
          <DemoPlayer course={result.course} />
        </section>
      ) : (
        <p role="alert">לא ניתן להציג את הקורס כי מבנה הנתונים שגוי.</p>
      )}
    </div>
  );
}
