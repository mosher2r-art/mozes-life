import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/server/actor";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "התחברות" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Logo width={260} priority />
        <h1 className="auth-title">התחברות</h1>
        <LoginForm />
        <p className="auth-note">החשבונות נפתחים על ידי מנהלי המערכת או באמצעות הזמנה מהארגון שלך.</p>
      </div>
    </main>
  );
}
