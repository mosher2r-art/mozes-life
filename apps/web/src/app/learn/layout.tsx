import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: { default: "Academy", template: "%s · MOZES LIFE Academy" } };

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.actor, "academy.access")) return <Forbidden />;
  return (
    <div className="academy">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <header className="academy-header">
        <Logo width={132} priority />
        <div className="academy-user">
          <span>{user.name}</span>
          <SignOutButton className="icon-btn icon-btn-dark" />
        </div>
      </header>
      <main id="main" className="academy-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
