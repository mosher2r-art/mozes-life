import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

/** 403 screen with a way out: back to the user's own area, or sign out and switch account. */
export function Forbidden() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">אין לך הרשאה לאזור הזה</h1>
        <p className="auth-note">אם לדעתך מדובר בטעות, פנה/י למנהל המערכת.</p>
        <Link className="btn btn-primary" href="/learn">
          לאזור הלמידה שלי
        </Link>
        <div className="forbidden-out">
          <span className="muted">מחובר/ת עם חשבון אחר ממה שצריך?</span>
          <SignOutButton className="btn btn-quiet btn-sm" label="התנתקות" />
        </div>
      </div>
    </main>
  );
}
