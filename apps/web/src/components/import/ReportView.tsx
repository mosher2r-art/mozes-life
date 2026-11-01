import type { AnalysisReport } from "@/server/import/analyze";
import { VERDICT_LABEL } from "@/server/import/analyze";
import { formatBytes } from "@/lib/media-policy";

const FORMAT_LABEL = { scorm12: "SCORM 1.2", scorm2004: "SCORM 2004", html5: "HTML5" } as const;
const SEV = { error: "שגיאה", warning: "אזהרה", info: "מידע" } as const;

/** The compatibility report shown after a package is checked. */
export function ReportView({ report }: { report: AnalysisReport }) {
  const tone = report.verdict === "play_only" ? "chip-done" : report.verdict === "partial" ? "chip-progress" : "chip-fail";
  return (
    <section className="block report" aria-labelledby="report-title">
      <div className="report-head">
        <h2 id="report-title">דוח תאימות</h2>
        <span className={`chip ${tone}`}>{VERDICT_LABEL[report.verdict]}</span>
      </div>
      <dl className="report-facts">
        <div><dt>סוג</dt><dd>{report.format ? FORMAT_LABEL[report.format] : "לא זוהה"}</dd></div>
        <div><dt>שם בחבילה</dt><dd>{report.title || "—"}</dd></div>
        <div><dt>קבצים</dt><dd className="num">{report.fileCount}</dd></div>
        <div><dt>גודל אחרי פריסה</dt><dd className="num">{formatBytes(report.totalBytes)}</dd></div>
        {report.launchPath && <div><dt>קובץ פתיחה</dt><dd dir="ltr">{report.launchPath}</dd></div>}
        {report.tracking && <div className="report-wide"><dt>מעקב</dt><dd>{report.tracking}</dd></div>}
      </dl>
      {report.items.length > 0 && (
        <ul className="issues">
          {report.items.map((i, n) => (
            <li key={n} className={`issue issue-${i.severity}`}>
              <span className="issue-sev">{SEV[i.severity]}</span>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      {report.verdict !== "unsupported" && (
        <p className="muted report-note">
          לומדה מיובאת רצה כמו שהיא, בסביבה מבודדת. אי אפשר לערוך את התוכן שלה בעורך הלומדות.
          {report.format !== "html5" && " הציון וההשלמה מדווחים על ידי הלומדה עצמה."}
        </p>
      )}
    </section>
  );
}
