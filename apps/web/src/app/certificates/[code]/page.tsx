import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCertificateByCode } from "@/server/certificates";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "תעודת סיום", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" });

/** Public verification page: anyone holding the code can confirm the certificate is genuine. */
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await getCertificateByCode(code);
  if (!c) notFound();
  return (
    <main className="cert-page">
      <article className="cert" aria-labelledby="cert-title">
        <div className="cert-frame">
          <Logo width={230} priority />
          <p className="cert-kicker">תעודת סיום</p>
          <h1 id="cert-title" className="cert-name">{c.learnerName}</h1>
          <p className="cert-line">השלים/ה בהצלחה את הקורס</p>
          <p className="cert-course">{c.courseTitle}</p>
          <dl className="cert-meta">
            <div><dt>תאריך</dt><dd>{fmt.format(c.issuedAt)}</dd></div>
            {c.scorePercent !== null && <div><dt>ציון</dt><dd className="num">{c.scorePercent}%</dd></div>}
            <div><dt>מספר תעודה</dt><dd dir="ltr" className="num">{c.code}</dd></div>
          </dl>
          <p className="cert-verify">התעודה הונפקה ואומתה במערכת MOZES LIFE. אפשר לאמת אותה בכתובת של דף זה.</p>
        </div>
      </article>
      <PrintButton />
    </main>
  );
}
