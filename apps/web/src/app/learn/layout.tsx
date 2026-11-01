import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@mozes/authz";
import { Forbidden } from "@/components/Forbidden";
import { getCurrentUser } from "@/server/actor";

export const metadata: Metadata = { title: { default: "Academy", template: "%s · MOZES LIFE Academy" } };

/** Auth gate for everything under /learn. Each section supplies its own chrome. */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.actor, "academy.access")) return <Forbidden />;
  return children;
}
