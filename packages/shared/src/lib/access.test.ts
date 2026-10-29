import type { BusinessMembership } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { decideCustomerAccess, decideStaffAccess, STAFF_CAPABILITIES, staffCan, type SessionUser } from "./access";

const user: SessionUser = { id: "user-1", email: "owner@example.com", name: "Riley Owner", emailConfirmed: true, phone: null };

const riverside: BusinessMembership = {
  businessId: "0192f3c4-0000-7000-8000-000000000001",
  businessName: "Riverside Plumbing",
  role: "owner",
};

describe("decideCustomerAccess", () => {
  it("is signed-out without a session", () => {
    expect(decideCustomerAccess(null, [riverside])).toEqual({ kind: "signed-out" });
  });

  it("reports an account with no business", () => {
    expect(decideCustomerAccess(user, [])).toEqual({ kind: "no-business", user });
  });

  it("grants access to the first (oldest) membership", () => {
    const later: BusinessMembership = { ...riverside, businessId: "later", businessName: "Later Co", role: "editor" };
    expect(decideCustomerAccess(user, [riverside, later])).toEqual({
      kind: "granted",
      user,
      tenant: {
        userId: user.id,
        businessId: riverside.businessId,
        businessName: "Riverside Plumbing",
        role: "owner",
      },
    });
  });
});

describe("decideStaffAccess", () => {
  it("is signed-out without a session", () => {
    expect(decideStaffAccess(null, { userId: user.id, role: "admin" })).toEqual({ kind: "signed-out" });
  });

  it("refuses accounts without active staff access", () => {
    expect(decideStaffAccess(user, null)).toEqual({ kind: "not-staff", user });
  });

  it("refuses a staff record that belongs to someone else", () => {
    expect(decideStaffAccess(user, { userId: "user-2", role: "admin" })).toEqual({ kind: "not-staff", user });
  });

  it("grants access to active staff", () => {
    expect(decideStaffAccess(user, { userId: user.id, role: "support" })).toEqual({
      kind: "granted",
      user,
      staff: { userId: user.id, role: "support" },
    });
  });
});

describe("staffCan", () => {
  it("lets support run the day to day and nothing with money or oversight in it", () => {
    expect(staffCan("support", "money")).toBe(false);
    expect(staffCan("support", "oversight")).toBe(false);
  });

  it("lets finance handle money but not read the access log", () => {
    expect(staffCan("finance", "money")).toBe(true);
    expect(staffCan("finance", "oversight")).toBe(false);
  });

  it("lets admin handle money and read the access log, which finance cannot", () => {
    expect(staffCan("admin", "money")).toBe(true);
    expect(staffCan("admin", "oversight")).toBe(true);
  });

  it("keeps the alert destinations (Teams addresses) to admins", () => {
    expect(staffCan("support", "integrations")).toBe(false);
    expect(staffCan("finance", "integrations")).toBe(false);
  });

  it("lets an admin do everything, in every capability that exists", () => {
    for (const capability of Object.keys(STAFF_CAPABILITIES) as (keyof typeof STAFF_CAPABILITIES)[]) {
      expect(staffCan("admin", capability)).toBe(true);
    }
  });
});
