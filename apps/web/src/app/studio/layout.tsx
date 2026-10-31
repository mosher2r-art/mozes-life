import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, ROLE_LABELS_HE } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { StudioNav } from "@/components/StudioNav";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · MOZES LIFE Studio" } };

// Navigation lists ONLY areas that are implemented. New areas are added as they ship.
const NAV = [
  { href: "/studio", label: "לוח בקרה" },
  { href: "/studio/preview/demo", label: "הדגמת נגן" },
] as const;

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.actor, "studio.access")) return <Forbidden />;

  const roles = user.actor.platformRoles.map((r) => ROLE_LABELS_HE[r]).join(" · ");

  return (
    <div className="studio">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <header className="studio-header">
        <div className="studio-brand">
          <Logo width={150} priority />
          <span className="studio-product">Studio</span>
        </div>
        <div className="studio-user">
          <span>
            <strong>{user.name}</strong>
            <span className="studio-roles">{roles}</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="studio-body">
        <StudioNav items={NAV} />
        <main id="main" className="studio-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
