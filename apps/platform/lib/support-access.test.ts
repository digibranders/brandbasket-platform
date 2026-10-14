import { describe, expect, it } from "vitest";
import type { CustomerAccess, SessionUser } from "@firstfold/shared/lib/access";
import { supportAccessFrom } from "./support-access";

const user: SessionUser = { id: "person", name: "Member", email: "internal@example.test", phone: "+919000000002", emailConfirmed: false };

describe("support account access", () => {
  it("allows a signed-in account without a business or paid membership", () => {
    expect(supportAccessFrom({ kind: "no-business", user })).toEqual({ user, businessId: null, businessName: null });
  });
  it("takes business context from verified membership", () => {
    const access: CustomerAccess = { kind: "granted", user, tenant: { userId: user.id, businessId: "business", businessName: "Clinic", role: "owner" } };
    expect(supportAccessFrom(access)).toMatchObject({ businessId: "business", businessName: "Clinic" });
  });
  it("does not reopen an account pending erasure", () => {
    expect(supportAccessFrom({ kind: "closing", user, eraseAfter: new Date() })).toBeNull();
  });
  it("refuses signed-out access", () => {
    expect(supportAccessFrom({ kind: "signed-out" })).toBeNull();
  });
});
