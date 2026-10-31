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

  const validation = (
    <section className="inspector-section" aria-labelledby="validation-title">
      <h2 id="validation-title" className="inspector-title">בדיקת תקינות</h2>
      <p className={`validity ${result.ok ? "is-ok" : "is-bad"}`}>
        {result.ok ? "הקורס תקין טכנית" : "נמצאו שגיאות שחוסמות פרסום"}
      </p>
      <dl className="counts">
        <div><dt>שגיאות</dt><dd className="num">{counts.error}</dd></div>
        <div><dt>אזהרות</dt><dd className="num">{counts.warning}</dd></div>
        <div><dt>מידע</dt><dd className="num">{counts.info}</dd></div>
      </dl>
      {result.issues.length > 0 && (
        <ul className="issues">
          {result.issues.map((i, n) => (
            <li key={n} className={`issue issue-${i.severity}`}>
              <span className="issue-sev">{SEVERITY_LABEL[i.severity]}</span>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="notice">{TECHNICAL_ONLY_NOTICE}</p>
    </section>
  );

  return (
    <div className="page page-wide">
      <header className="page-head">
        <p className="kicker">תצוגה מקדימה</p>
        <h1 className="page-title">הדגמת נגן</h1>
        <p className="muted">קורס הדגמה טכני ולא רפואי שמציג את כל סוגי המסכים והאינטראקציות, בדיוק כפי שהלומדים יראו אותם.</p>
      </header>
      {result.course ? (
        <DemoPlayer course={result.course} validation={validation} />
      ) : (
        <p role="alert">לא ניתן להציג את הקורס כי מבנה הנתונים שגוי.</p>
      )}
    </div>
  );
}
