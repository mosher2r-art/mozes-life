import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
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
          <Logo width={260} priority />
          <h1 className="auth-title">כניסה לחשבון</h1>
          <p className="auth-sub">התחברו כדי להמשיך ללמידה או לניהול התוכן.</p>
          <LoginForm />
          <p className="auth-note">החשבונות נפתחים על ידי מנהלי המערכת או באמצעות הזמנה מהארגון שלכם.</p>
        </div>
      </section>
    </main>
  );
}
