import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAlreadyExistsError } from "@fynix/auth";
import { completeSetup } from "@/app/app-host/setup/[token]/actions";
import { completeAffiliateSetup } from "@/app/app-host/affiliate/setup/[token]/actions";
import { redeemSetupInvite, TermsNotAgreedError } from "@/lib/server/setup";
import { redeemAffiliateLogin } from "@/lib/server/affiliate-setup";
import { initialSetupFormState } from "./setup-form";

vi.mock("@/lib/server/request-brand", async () => {
  const { LISTING_BRAND } = await import("@/lib/testing/listing-brand");
  return { requestBrand: async () => LISTING_BRAND, currentBrand: async () => LISTING_BRAND };
});
vi.mock("@fynix/shared/server/turnstile-request", () => ({ checkHuman: vi.fn(async () => ({ ok: true })), turnstileSiteKey: () => null }));
vi.mock("@fynix/auth", () => ({ AccountAlreadyExistsError: class extends Error {} }));
vi.mock("@fynix/db", () => ({ InviteNoLongerRedeemableError: class extends Error {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/lib/server/setup", () => ({
  redeemSetupInvite: vi.fn(), InviteNotUsableError: class extends Error {}, TooManySetupAttemptsError: class extends Error {},
  TermsNotAgreedError: class extends Error {},
}));
vi.mock("@/lib/server/affiliate-setup", () => ({
  redeemAffiliateLogin: vi.fn(), AffiliateAccountTakenError: class extends Error {},
}));

function form(mode?: string): FormData {
  const data = new FormData();
  data.set("token", "invite");
  data.set("name", "Owner");
  data.set("password", mode === "verify-existing" ? "short" : "new-password-proposal-9");
  if (mode === undefined) data.set("confirmPassword", "new-password-proposal-9");
  else data.set("mode", mode);
  return data;
}

beforeEach(() => vi.resetAllMocks());

describe.each([
  ["customer", completeSetup, vi.mocked(redeemSetupInvite)],
  ["affiliate", completeAffiliateSetup, vi.mocked(redeemAffiliateLogin)],
] as const)("%s setup action", (_name, action, redeem) => {
  it("returns a server-controlled existing-account mode without credentials", async () => {
    redeem.mockRejectedValue(new AccountAlreadyExistsError("owner@example.com"));
    const state = await action(initialSetupFormState, form());
    expect(state).toMatchObject({ status: "error", mode: "verify-existing", field: "password" });
    expect(JSON.stringify(state)).not.toContain("new-password-proposal-9");
  });
  it("passes current-password verification to the server without requiring confirmation", async () => {
    redeem.mockRejectedValue(new AccountAlreadyExistsError("owner@example.com"));
    await action(initialSetupFormState, form("verify-existing"));
    expect(redeem).toHaveBeenCalledWith("invite", { name: "Owner", password: "short", mode: "verify-existing" });
  });
  it("asks for the Terms tick when the server says an account would be made without it, and points at the box", async () => {
    redeem.mockRejectedValue(new TermsNotAgreedError());
    expect(await action(initialSetupFormState, form())).toEqual({
      status: "error", message: "Tick the box to agree to the Terms and Privacy Notice.", field: "agree", mode: undefined,
    });
  });
  it("passes the tick on to the server", async () => {
    redeem.mockResolvedValue(undefined as never);
    const data = form();
    data.set("agree", "yes");
    await action(initialSetupFormState, data).catch(() => undefined);
    expect(redeem).toHaveBeenCalledWith("invite", { name: "Owner", password: "new-password-proposal-9", agreed: true });
  });
  it("retains verification mode and focuses its invalid empty password", async () => {
    const data = form("verify-existing");
    data.set("password", "");
    expect(await action(initialSetupFormState, data)).toMatchObject({ status: "error", mode: "verify-existing", field: "password" });
    expect(redeem).not.toHaveBeenCalled();
  });
});
