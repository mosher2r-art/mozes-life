import { describe, expect, it } from "vitest";
import { ACTIONS, assertCan, can, ForbiddenError, type Action, type Actor } from "./index";

const actor = (p: Partial<Actor> = {}): Actor => ({ userId: "u1", platformRoles: [], orgRoles: {}, ...p });

describe("can()", () => {
  it("denies everything to anonymous", () => {
    for (const a of ACTIONS) {
      expect(can(null, a)).toBe(false);
      expect(can(undefined, a, { orgId: "o1" })).toBe(false);
    }
  });

  it("denies everything to a user with no roles", () => {
    for (const a of ACTIONS) expect(can(actor(), a, { orgId: "o1" })).toBe(false);
  });

  it("grants super_admin every action", () => {
    for (const a of ACTIONS) expect(can(actor({ platformRoles: ["super_admin"] }), a)).toBe(true);
  });

  it("editor can edit but not publish, import or override", () => {
    const e = actor({ platformRoles: ["editor"] });
    expect(can(e, "studio.access")).toBe(true);
    expect(can(e, "course.edit")).toBe(true);
    for (const a of ["course.publish", "course.import", "medical.override_publish_block", "system.settings"] as Action[])
      expect(can(e, a)).toBe(false);
  });

  it("medical_reviewer reviews but cannot edit or publish", () => {
    const r = actor({ platformRoles: ["medical_reviewer"] });
    expect(can(r, "medical.review")).toBe(true);
    expect(can(r, "course.edit")).toBe(false);
    expect(can(r, "course.publish")).toBe(false);
  });

  it("content_admin cannot override the medical block or change system settings", () => {
    const c = actor({ platformRoles: ["content_admin"] });
    expect(can(c, "course.publish")).toBe(true);
    expect(can(c, "medical.override_publish_block")).toBe(false);
    expect(can(c, "system.settings")).toBe(false);
  });

  it("learners never get Studio", () => {
    const l = actor({ orgRoles: { o1: "learner" } });
    expect(can(l, "studio.access")).toBe(false);
    expect(can(l, "academy.access")).toBe(true);
  });

  it("org_admin is scoped to their own organization", () => {
    const oa = actor({ orgRoles: { o1: "org_admin", o2: "learner" } });
    expect(can(oa, "org.view_progress", { orgId: "o1" })).toBe(true);
    expect(can(oa, "org.view_progress", { orgId: "o2" })).toBe(false);
    expect(can(oa, "org.view_progress", { orgId: "o3" })).toBe(false);
    expect(can(oa, "org.view_progress")).toBe(false); // missing org → deny
    expect(can(oa, "studio.access")).toBe(false);
  });

  it("ignores unknown role strings from storage", () => {
    const bogus = { userId: "x", platformRoles: ["root"], orgRoles: { o1: "owner" } } as unknown as Actor;
    for (const a of ACTIONS) expect(can(bogus, a, { orgId: "o1" })).toBe(false);
  });
});

describe("assertCan()", () => {
  it("throws ForbiddenError with status 403", () => {
    expect(() => assertCan(actor(), "studio.access")).toThrow(ForbiddenError);
    try {
      assertCan(actor(), "course.publish");
    } catch (e) {
      expect((e as ForbiddenError).status).toBe(403);
    }
  });
});
