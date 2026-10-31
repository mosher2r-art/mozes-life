/**
 * MOZES LIFE — authorization policy.
 *
 * Pure, dependency-free and deterministic so it can be unit-tested exhaustively.
 * Every server entry point must call `can()` / `assertCan()`; hiding UI elements
 * is a convenience only and never a security control.
 */

/** Platform-wide roles (staff of MOZES LIFE). */
export const PLATFORM_ROLES = [
  "super_admin",
  "content_admin",
  "editor",
  "medical_reviewer",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Roles inside a customer organization. */
export const ORG_ROLES = ["org_admin", "learner"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ACTIONS = [
  "studio.access",
  "course.view_draft",
  "course.create",
  "course.edit",
  "course.publish",
  "course.import",
  "media.manage",
  "medical.review",
  "medical.override_publish_block",
  "users.manage_platform",
  "org.manage",
  "org.view_progress",
  "org.manage_members",
  "system.settings",
  "audit.view",
  "academy.access",
] as const;
export type Action = (typeof ACTIONS)[number];

export interface Actor {
  userId: string;
  platformRoles: readonly PlatformRole[];
  /** orgId -> role inside that organization */
  orgRoles: Readonly<Record<string, OrgRole>>;
}

export interface Resource {
  /** Required for org-scoped actions. */
  orgId?: string;
}

const PLATFORM_GRANTS: Record<PlatformRole, readonly Action[]> = {
  super_admin: ACTIONS,
  content_admin: [
    "studio.access",
    "course.view_draft",
    "course.create",
    "course.edit",
    "course.publish",
    "course.import",
    "media.manage",
    "academy.access",
  ],
  editor: [
    "studio.access",
    "course.view_draft",
    "course.create",
    "course.edit",
    "media.manage",
    "academy.access",
  ],
  medical_reviewer: ["studio.access", "course.view_draft", "medical.review", "academy.access"],
};

const ORG_GRANTS: Record<OrgRole, readonly Action[]> = {
  org_admin: ["org.view_progress", "org.manage_members", "academy.access"],
  learner: ["academy.access"],
};

/** Actions that only make sense against a specific organization. */
const ORG_SCOPED: ReadonlySet<Action> = new Set<Action>([
  "org.view_progress",
  "org.manage_members",
]);

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function can(actor: Actor | null | undefined, action: Action, resource: Resource = {}): boolean {
  if (!actor) return false;

  // Unknown role strings (e.g. stale DB values) grant nothing.
  for (const role of actor.platformRoles) {
    if (isPlatformRole(role) && PLATFORM_GRANTS[role].includes(action)) return true;
  }

  if (ORG_SCOPED.has(action)) {
    if (!resource.orgId) return false; // fail closed: org action without an org
    const role = actor.orgRoles[resource.orgId];
    return isOrgRole(role) && ORG_GRANTS[role].includes(action);
  }

  // Non-scoped action granted through any org membership (e.g. academy.access).
  return Object.values(actor.orgRoles).some(
    (role) => isOrgRole(role) && ORG_GRANTS[role].includes(action),
  );
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(readonly action: Action) {
    super(`Forbidden: ${action}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: Actor | null | undefined, action: Action, resource?: Resource): void {
  if (!can(actor, action, resource)) throw new ForbiddenError(action);
}

/** Hebrew labels for UI display. */
export const ROLE_LABELS_HE: Record<PlatformRole | OrgRole, string> = {
  super_admin: "מנהל/ת מערכת",
  content_admin: "מנהל/ת תוכן",
  editor: "עורך/ת תוכן",
  medical_reviewer: "סוקר/ת רפואי/ת",
  org_admin: "מנהל/ת ארגון",
  learner: "לומד/ת",
};
