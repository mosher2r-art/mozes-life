import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentUser } from "@/server/actor";

export default async function AcademyHomeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="academy">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <header className="academy-header">
        <div className="academy-header-inner">
          <Link href="/learn" aria-label="MOZES LIFE Academy — הקורסים שלי" className="academy-home-link">
            <Logo width={132} priority />
          </Link>
          <div className="academy-user">
            <span className="avatar avatar-light" aria-hidden="true">
              {user?.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span className="academy-user-name">{user?.name}</span>
            <SignOutButton className="icon-btn icon-btn-light" />
          </div>
        </div>
      </header>
      <main id="main" className="academy-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
