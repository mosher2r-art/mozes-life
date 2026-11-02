import type { Metadata } from "next";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { driver } from "@/server/storage";
import { MAX_PACKAGE_BYTES } from "@/server/importer";
import { ImportWizard } from "./ImportWizard";
import { ChapterImport } from "@/components/chapters/ChapterImport";

export const metadata: Metadata = { title: "ייבוא לומדה" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!can(user?.actor, "course.import")) return <Forbidden />;
  return (
    <div className="page page-wide">
      <header className="page-head">
        <p className="kicker">MOZES LIFE Import Center</p>
        <h1 className="page-title">ייבוא לומדה מוכנה</h1>
        <p className="muted">מייבאים פרקי וקורסי JSON, לומדות אינטראקטיביות של MOZES, או חבילות ZIP מסוג SCORM ו־HTML5.</p>
      </header>
      <section className="block" aria-labelledby="json-import-title">
        <h2 id="json-import-title" className="block-title">ייבוא קובצי JSON</h2>
        <ChapterImport />
      </section>
      {driver() === "none" ? (
        <div className="block media-off" role="status">
          <h2>אחסון הקבצים עדיין לא הוגדר</h2>
          <p className="muted">לייבוא חבילות ZIP יש לחבר אחסון קבצים. ייבוא פרקי JSON זמין גם ללא אחסון מדיה חיצוני.</p>
        </div>
      ) : (
        <ImportWizard maxBytes={MAX_PACKAGE_BYTES} />
      )}
    </div>
  );
}
