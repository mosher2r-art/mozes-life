import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/server/actor";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "התחברות" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth">
      <section className="auth-hero" aria-hidden="true" />
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <Link href="/" className="auth-brand" aria-label="MOZES LIFE — לדף הבית">
            <Image src="/brand/mozes-life-opening-logo.png" alt="MOZES LIFE — לומדים להציל חיים" width={2045} height={866} sizes="(max-width: 440px) 90vw, 380px" priority />
          </Link>
          <h1 className="auth-title">כניסה לחשבון</h1>
          <p className="auth-sub">התחברו כדי להמשיך ללמידה או לניהול התוכן.</p>
          <LoginForm />
          <p className="auth-note">החשבונות נפתחים על ידי מנהלי המערכת או באמצעות הזמנה מהארגון שלכם.</p>
        </div>
      </section>
    </main>
  );
}
