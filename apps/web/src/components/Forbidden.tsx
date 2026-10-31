import Link from "next/link";

export function Forbidden() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">אין לך הרשאה לאזור הזה</h1>
        <p className="auth-note">אם לדעתך מדובר בטעות, פנה/י למנהל המערכת.</p>
        <Link className="btn btn-primary" href="/">
          חזרה לדף הבית
        </Link>
      </div>
    </main>
  );
}
