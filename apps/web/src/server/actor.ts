import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { type Actor, isOrgRole, isPlatformRole } from "@mozes/authz";
import { db } from "@/db";
import { membership, userPlatformRole } from "@/db/schema";
import { auth } from "@/lib/auth";

export interface CurrentUser {
  actor: Actor;
  name: string;
  email: string;
}

/**
 * Resolves the signed-in user and their roles from the database on every request
 * (roles are never trusted from the client or cached in the session cookie).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const userId = session.user.id;

  const [roles, memberships] = await Promise.all([
    db.select({ role: userPlatformRole.role }).from(userPlatformRole).where(eq(userPlatformRole.userId, userId)),
    db.select({ orgId: membership.orgId, role: membership.role }).from(membership).where(eq(membership.userId, userId)),
  ]);

  const orgRoles: Actor["orgRoles"] = {};
  for (const m of memberships) if (isOrgRole(m.role)) (orgRoles as Record<string, string>)[m.orgId] = m.role;

  return {
    actor: {
      userId,
      platformRoles: roles.map((r) => r.role).filter(isPlatformRole),
      orgRoles,
    },
    name: session.user.name,
    email: session.user.email,
  };
});
