import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@mozes/authz";
import { ChapterImport } from "@/components/chapters/ChapterImport";
import { ChapterRowActions } from "@/components/chapters/ChapterRowActions";
import { NewChapterForm } from "@/components/chapters/NewChapterForm";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { listChapters } from "@/server/chapters";

export const metadata: Metadata = { title: "מאגר פרקים" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export default async function ChaptersPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.view_draft")) return <Forbidden />;
  const { kind } = await searchParams;
  const all = await listChapters();
  const chapters = kind === "exam" || kind === "lesson" ? all.filter((c) => c.kind === kind) : all;
  const canCreate = can(user?.actor, "course.create");
  const canEdit = can(user?.actor, "course.edit");

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">ניהול תוכן</p>
        <h1 className="page-title">מאגר פרקים</h1>
        <p className="muted">כאן בונים שיעורים ומבחנים. כל פרק אפשר לשבץ בכמה קורסים, ושינוי בפרק מגיע ללומדים אחרי שמפרסמים מחדש את הקורס.</p>
      </header>

      {canCreate && (
        <div className="split">
          <section className="block" aria-labelledby="new-ch">
            <h2 id="new-ch" className="block-title">פרק חדש</h2>
            <NewChapterForm />
          </section>
          <section className="block" aria-labelledby="imp-ch">
            <h2 id="imp-ch" className="block-title">ייבוא פרקים מקובץ</h2>
            <ChapterImport />
          </section>
        </div>
      )}

      <nav className="tabs" aria-label="סינון לפי סוג">
        <Link href="/studio/chapters" aria-current={!kind ? "page" : undefined} className={!kind ? "is-active" : ""}>הכול ({all.length})</Link>
        <Link href="/studio/chapters?kind=lesson" aria-current={kind === "lesson" ? "page" : undefined} className={kind === "lesson" ? "is-active" : ""}>שיעורים ({all.filter((c) => c.kind === "lesson").length})</Link>
        <Link href="/studio/chapters?kind=exam" aria-current={kind === "exam" ? "page" : undefined} className={kind === "exam" ? "is-active" : ""}>מבחנים ({all.filter((c) => c.kind === "exam").length})</Link>
      </nav>

      {chapters.length === 0 ? (
        <div className="block"><p className="muted">אין פרקים {kind ? "מהסוג הזה " : ""}עדיין.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">פרק</th>
                <th scope="col">סוג</th>
                <th scope="col">מסכים</th>
                <th scope="col">שאלות</th>
                <th scope="col">משובץ בקורסים</th>
                <th scope="col">עדכון אחרון</th>
                <th scope="col"><span className="visually-hidden">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <Link href={`/studio/chapters/${c.id}`} className="table-title">{c.title}</Link>
                    {c.errors > 0 && <span className="chip chip-progress">{c.errors} שגיאות</span>}
                  </th>
                  <td><span className={`chip ${c.kind === "exam" ? "chip-exam" : "chip-neutral"}`}>{c.kind === "exam" ? "מבחן" : "שיעור"}</span></td>
                  <td className="num">{c.screens}</td>
                  <td className="num">{c.questions}</td>
                  <td>{c.usedIn.length ? c.usedIn.map((u, i) => <span key={u.id}>{i > 0 && ", "}<Link href={`/studio/courses/${u.id}`}>{u.title}</Link></span>) : <span className="muted">—</span>}</td>
                  <td className="muted">{fmt.format(c.updatedAt)}</td>
                  <td className="table-actions">
                    <ChapterRowActions id={c.id} title={c.title} used={c.usedIn.length} canCreate={canCreate} canEdit={canEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
