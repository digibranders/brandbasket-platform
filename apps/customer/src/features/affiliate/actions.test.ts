import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeAffiliateSetupAction } from "./actions";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirected to ${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  checkHuman: vi.fn(),
  redeem: vi.fn(),
  AccountAlreadyExistsError: class AccountAlreadyExistsError extends Error {},
  InviteNotUsableError: class InviteNotUsableError extends Error {},
  TermsNotAgreedError: class TermsNotAgreedError extends Error {},
  TooManySetupAttemptsError: class TooManySetupAttemptsError extends Error {},
  AffiliateAccountTakenError: class AffiliateAccountTakenError extends Error {},
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@brandbasket/auth", () => ({ AccountAlreadyExistsError: mocks.AccountAlreadyExistsError }));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: mocks.checkHuman }));
vi.mock("@/features/entry/server/setup", () => ({
  InviteNotUsableError: mocks.InviteNotUsableError,
  TermsNotAgreedError: mocks.TermsNotAgreedError,
  TooManySetupAttemptsError: mocks.TooManySetupAttemptsError,
}));
vi.mock("./server/setup", () => ({ redeemAffiliateLogin: mocks.redeem, AffiliateAccountTakenError: mocks.AffiliateAccountTakenError }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const NEW_ACCOUNT = { token: "tok", name: "Asha Nair", password: "a-long-password-9!", confirmPassword: "a-long-password-9!", agree: "yes" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.checkHuman.mockResolvedValue({ ok: true });
});

describe("completeAffiliateSetupAction", () => {
  it("needs the link's token", async () => {
    expect(await completeAffiliateSetupAction(null, form({ ...NEW_ACCOUNT, token: "" }))).toMatchObject({ ok: false });
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("runs the robot check under its own name before it reads the form", async () => {
    mocks.checkHuman.mockResolvedValue({ ok: false, message: "Please confirm you are not a robot." });
    expect(await completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).toMatchObject({ ok: false, message: "Please confirm you are not a robot." });
    expect(mocks.checkHuman).toHaveBeenCalledWith(expect.any(FormData), "affiliate_setup");
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("names the field to put right", async () => {
    expect(await completeAffiliateSetupAction(null, form({ ...NEW_ACCOUNT, confirmPassword: "different-9!" }))).toMatchObject({ ok: false, field: "confirmPassword" });
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("signs a new affiliate in and lands on the dashboard", async () => {
    mocks.redeem.mockResolvedValue({ signedIn: true });
    await expect(completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).rejects.toMatchObject({ to: "/affiliate" });
    expect(mocks.redeem).toHaveBeenCalledWith("tok", expect.objectContaining({ name: "Asha Nair", agreed: true }));
  });

  it("sends an affiliate who chose a new password to sign in, without signing them in", async () => {
    mocks.redeem.mockResolvedValue({ signedIn: false });
    await expect(completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).rejects.toMatchObject({ to: "/login?notice=password-changed" });
  });

  it("asks for the existing account's password when the address already has an account", async () => {
    mocks.redeem.mockRejectedValue(new mocks.AccountAlreadyExistsError());
    const result = await completeAffiliateSetupAction(null, form(NEW_ACCOUNT));
    expect(result).toMatchObject({ ok: false, mode: "verify-existing", field: "password" });
  });

  it("maps every refusal to a clear message", async () => {
    mocks.redeem.mockRejectedValueOnce(new mocks.TermsNotAgreedError());
    expect(await completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).toMatchObject({ ok: false, field: "agree" });
    mocks.redeem.mockRejectedValueOnce(new mocks.InviteNotUsableError());
    expect(await completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).toMatchObject({ ok: false, message: "This link no longer works. Ask us for a new one." });
    mocks.redeem.mockRejectedValueOnce(new mocks.TooManySetupAttemptsError("Try again in 12 minutes."));
    expect(await completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).toMatchObject({ ok: false, message: "Try again in 12 minutes." });
    mocks.redeem.mockRejectedValueOnce(new mocks.AffiliateAccountTakenError());
    expect(await completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).toMatchObject({ ok: false, message: expect.stringContaining("another affiliate") });
  });

  it("lets a real fault through to the error boundary", async () => {
    mocks.redeem.mockRejectedValue(new Error("database down"));
    await expect(completeAffiliateSetupAction(null, form(NEW_ACCOUNT))).rejects.toThrow("database down");
  });
});
