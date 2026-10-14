import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkHuman } from "@firstfold/shared/server/turnstile-request";
import { joinForListing, signInCustomer } from "@/app/app-host/login/actions";
import { requestPasswordResetAction } from "@/app/app-host/forgot-password/actions";
import { resetPasswordAction } from "@/app/app-host/reset-password/[token]/actions";
import { completeSetup } from "@/app/app-host/setup/[token]/actions";
import { completeAffiliateSetup } from "@/app/app-host/affiliate/setup/[token]/actions";
import { signInWithPassword } from "@/lib/server/sign-in";
import { createListingAccount, requestJoinCode } from "@/lib/server/listing-account";
import { requestPasswordReset, resetPassword } from "@/lib/server/account-recovery";
import { redeemSetupInvite } from "@/lib/server/setup";
import { redeemAffiliateLogin } from "@/lib/server/affiliate-setup";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@firstfold/auth", () => ({ AccountAlreadyExistsError: class extends Error {} }));
vi.mock("@firstfold/db", () => ({ InviteNoLongerRedeemableError: class extends Error {} }));
vi.mock("@/lib/server/sign-in", () => ({ signInWithPassword: vi.fn() }));
vi.mock("@/lib/server/affiliate-access", () => ({ landingForSignedInUser: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ LISTING_ACCOUNT_HOME: "/", LISTING_PAGE_PATH: "/listing" }));
vi.mock("@/lib/server/listing-account", () => ({ requestJoinCode: vi.fn(), createListingAccount: vi.fn() }));
vi.mock("@/lib/server/account-recovery", () => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/lib/server/phone-password-reset", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/phone-password-reset")>("@/lib/server/phone-password-reset");
  return { parseForgotPasswordRequest: actual.parseForgotPasswordRequest, requestPhonePasswordReset: vi.fn(), resetPasswordWithCode: vi.fn() };
});
vi.mock("@/lib/server/setup", () => ({ redeemSetupInvite: vi.fn(), InviteNotUsableError: class extends Error {}, TooManySetupAttemptsError: class extends Error {} }));
vi.mock("@/lib/server/affiliate-setup", () => ({ redeemAffiliateLogin: vi.fn(), AffiliateAccountTakenError: class extends Error {} }));

const REFUSAL = { ok: false, message: "The robot check did not pass. Reload the page and try again." } as const;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkHuman).mockResolvedValue(REFUSAL);
});

describe("the robot check on the unauthenticated forms", () => {
  it("refuses a sign-in before it looks at the password, and gives the typed address back", async () => {
    const result = await signInCustomer({ status: "idle" }, form({ email: " owner@example.com ", password: "x" }));
    expect(result).toEqual({ status: "error", message: REFUSAL.message, email: "owner@example.com" });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "sign_in");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a sign-up before it texts a code or opens an account", async () => {
    const result = await joinForListing({ status: "idle" }, form({ choice: "listing_only", name: "Meera", phone: "9820011223", password: "correct-horse-battery" }));
    expect(result).toEqual({ status: "error", message: REFUSAL.message, otp: null });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "join");
    expect(requestJoinCode).not.toHaveBeenCalled();
    expect(createListingAccount).not.toHaveBeenCalled();
  });

  it("refuses a password reset request before it sends a link or a code", async () => {
    const result = await requestPasswordResetAction({ status: "idle" }, form({ identifier: "owner@example.com" }));
    expect(result).toEqual({ status: "error", message: REFUSAL.message, otp: null });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "forgot_password");
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("refuses a new password before it uses the reset link", async () => {
    const result = await resetPasswordAction({ status: "idle" }, form({ token: "t", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" }));
    expect(result).toEqual({ status: "error", message: REFUSAL.message });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "reset_password");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("refuses a setup before it spends the setup link", async () => {
    const result = await completeSetup({ status: "idle" }, form({ token: "invite", name: "Owner", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" }));
    expect(result).toMatchObject({ status: "error", message: REFUSAL.message });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "setup");
    expect(redeemSetupInvite).not.toHaveBeenCalled();
  });

  it("refuses an affiliate's setup before it spends their link", async () => {
    const result = await completeAffiliateSetup({ status: "idle" }, form({ token: "invite", name: "Owner", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" }));
    expect(result).toMatchObject({ status: "error", message: REFUSAL.message });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "affiliate_setup");
    expect(redeemAffiliateLogin).not.toHaveBeenCalled();
  });
});
