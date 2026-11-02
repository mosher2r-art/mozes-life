import type { Metadata } from "next";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";
import { driver } from "@/server/storage";
import { MAX_PACKAGE_BYTES } from "@/server/importer";
import { ImportWizard } from "./ImportWizard";

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
        <p className="muted">מעלים קובץ ZIP של לומדת SCORM 1.2, SCORM 2004 או HTML5. החבילה נבדקת לפני שמשהו ממנה נשמר, ורצה בסביבה מבודדת מהאתר.</p>
      </header>
      {driver() === "none" ? (
        <div className="block media-off" role="status">
          <h2>אחסון הקבצים עדיין לא הוגדר</h2>
          <p className="muted">כדי לייבא לומדות צריך לחבר את Cloudflare R2. ההוראות נמצאות בקובץ DEPLOY.md במאגר.</p>
        </div>
      ) : (
        <ImportWizard maxBytes={MAX_PACKAGE_BYTES} />
      )}
    </div>
  );
}
