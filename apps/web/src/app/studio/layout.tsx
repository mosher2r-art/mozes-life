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
  { href: "/studio", label: "לוח בקרה", icon: "dashboard" },
  { href: "/studio/courses", label: "קורסים", icon: "book" },
  { href: "/studio/chapters", label: "מאגר פרקים", icon: "layers" },
  { href: "/studio/media", label: "ספריית מדיה", icon: "media" },
  { href: "/studio/import", label: "ייבוא לומדה", icon: "import" },
  { href: "/studio/users", label: "משתמשים", icon: "users", action: "users.manage_platform" },
  { href: "/studio/orgs", label: "ארגונים", icon: "org", action: "org.manage" },
  { href: "/studio/preview/demo", label: "הדגמת נגן", icon: "play" },
] as const;

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.actor, "studio.access")) return <Forbidden />;

  const roles = user.actor.platformRoles.map((r) => ROLE_LABELS_HE[r]).join(" · ");
  const initials = user.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");

  return (
    <div className="studio">
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      <aside className="studio-side">
        <div className="studio-brand">
          <Logo width={170} priority surface="dark" />
          <span className="studio-product">STUDIO</span>
        </div>
        <StudioNav items={NAV.filter((n) => !("action" in n) || can(user.actor, n.action))} />
        <div className="studio-user">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="studio-user-text">
            <strong>{user.name}</strong>
            <span className="studio-roles">{roles}</span>
          </span>
          <SignOutButton />
        </div>
      </aside>
      <main id="main" className="studio-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
