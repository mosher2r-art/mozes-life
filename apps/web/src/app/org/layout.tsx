import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: { default: "ניהול הארגון", template: "%s · MOZES LIFE" } };

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="academy">
      <a className="skip-link" href="#main">דילוג לתוכן הראשי</a>
      <header className="academy-header">
        <div className="academy-header-inner">
          <Link href="/org" className="academy-home-link" aria-label="ניהול הארגון"><Logo width={132} priority /></Link>
          <nav className="academy-nav" aria-label="ניווט">
            <Link href="/learn">הקורסים שלי</Link>
          </nav>
          <div className="academy-user">
            <span className="academy-user-name">{user.name}</span>
            <SignOutButton className="icon-btn icon-btn-light" />
          </div>
        </div>
      </header>
      <main id="main" className="academy-main org-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
