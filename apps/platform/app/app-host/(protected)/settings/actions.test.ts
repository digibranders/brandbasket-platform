import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordAction, revokeOtherSessionsAction } from "./actions";
const mocks = vi.hoisted(() => ({ change: vi.fn(), revoke: vi.fn(), access: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/account-security", () => ({ changePasswordFor: mocks.change, revokeOtherSessionsFor: mocks.revoke }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: mocks.access }));
vi.mock("@/lib/server/account-exit", () => ({ claimRetentionOfferFor: vi.fn(), closeAccountFor: vi.fn(), findRetentionOfferView: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getAuth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ user: { id: "session-user" } }); });
function passwords(): FormData {
  const form = new FormData();
  form.set("currentPassword", "current-password"); form.set("newPassword", "new-long-password"); form.set("confirmPassword", "new-long-password");
  form.set("userId", "attacker-user");
  return form;
}
describe("password settings actions", () => {
  it("maps partial success without replaying or retaining passwords", async () => {
    mocks.change.mockResolvedValue("changed-revoke-failed");
    expect(await changePasswordAction({ status: "idle" }, passwords())).toEqual({ status: "changed-revoke-failed" });
    expect(mocks.change).toHaveBeenCalledWith("session-user", { currentPassword: "current-password", newPassword: "new-long-password" });
  });
  it("revokes only for the authenticated account and accepts no credentials", async () => {
    mocks.revoke.mockResolvedValue("revoked");
    expect(await revokeOtherSessionsAction()).toEqual({ status: "revoked" });
    expect(mocks.revoke).toHaveBeenCalledWith("session-user");
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it.each(["limited", "failed"])("keeps retry errors truthful for %s revocation", async (outcome) => {
    mocks.revoke.mockResolvedValue(outcome);
    expect(await revokeOtherSessionsAction()).toMatchObject({ status: "error", message: expect.any(String) });
  });
});
