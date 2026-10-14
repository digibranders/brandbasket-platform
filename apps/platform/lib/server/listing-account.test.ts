import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAlreadyExistsError, createVerifiedEmailAccountWithGrant } from "@fynix/auth";
import {
  consumeRateLimit,
  createUnlistedAccountBusiness,
  findUserByEmail,
  recordConsent,
  UserAlreadyHasBusinessError,
  type Database,
} from "@fynix/db";
import { LEGAL_TEXT_VERSION } from "@fynix/shared/lib/privacy/notice-version";
import type { JoinInput } from "@/lib/join-form";
import { confirmAccountEmailCode, requestAccountEmailCode } from "./account-email-code";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { createListingAccount, requestJoinCode } from "./listing-account";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })) }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
// Signing in goes straight through to Better Auth here (customer-sign-in.test.ts covers the wrapper), so these tests check the sign-in itself.
vi.mock("./customer-sign-in", async () => {
  const { getAuth } = await import("./auth");
  return {
    signInCustomer: vi.fn(async (credentials: { email: string; password: string }, headers: Headers) => {
      const result = await getAuth().api.signInEmail({ body: { ...credentials }, headers });
      return { userId: result?.user.id };
    }),
  };
});
vi.mock("./account-email-code", () => ({ requestAccountEmailCode: vi.fn(), confirmAccountEmailCode: vi.fn() }));
vi.mock("@fynix/auth", async () => {
  const actual = await vi.importActual<typeof import("@fynix/auth")>("@fynix/auth");
  return { AccountAlreadyExistsError: actual.AccountAlreadyExistsError, createVerifiedEmailAccountWithGrant: vi.fn() };
});
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return {
    phoneAccountEmail: actual.phoneAccountEmail,
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
    UserAlreadyHasBusinessError: actual.UserAlreadyHasBusinessError,
    consumeRateLimit: vi.fn(),
    createUnlistedAccountBusiness: vi.fn(),
    recordConsent: vi.fn(),
    findUserByEmail: vi.fn(),
  };
});

const DB = {} as Database;
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const EMAIL = "meera.shah@example.test";
const signInEmail = vi.fn();

const FIRST: JoinInput = { choice: "care", businessName: "Smile Dental", name: "Meera Shah", email: EMAIL, password: "correct-horse-battery", agreed: true, code: null };
const WITH_CODE: JoinInput = { ...FIRST, code: { otpId: OTP_ID, code: "123456" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(getAuth).mockReturnValue({ api: { signInEmail } } as unknown as ReturnType<typeof getAuth>);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(findUserByEmail).mockResolvedValue(null);
  vi.mocked(requestAccountEmailCode).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.test", confirmRequired: true });
  vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "confirmed" });
  vi.mocked(createVerifiedEmailAccountWithGrant).mockResolvedValue({ userId: "user-2", email: EMAIL });
  vi.mocked(createUnlistedAccountBusiness).mockResolvedValue({ businessId: "business-1" });
  vi.mocked(recordConsent).mockResolvedValue(undefined);
});

describe("requestJoinCode", () => {
  it("emails a sign-up code to the address", async () => {
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "code", otp: { otpId: OTP_ID, emailHint: "m•••@example.test", confirmRequired: true } });
    expect(requestAccountEmailCode).toHaveBeenCalledWith({ email: EMAIL }, "203.0.113.9", expect.any(Date));
  });

  it("tells the form when no code has to be read, so it does not say one must be", async () => {
    vi.mocked(requestAccountEmailCode).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.test", confirmRequired: false });
    expect(await requestJoinCode(FIRST)).toMatchObject({ kind: "code", otp: { confirmRequired: false } });
  });

  it("sends an address that already has an account to sign in, and emails nothing", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", name: "Meera", email: EMAIL });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "refused", message: "This email already has an account. Sign in instead." });
    expect(requestAccountEmailCode).not.toHaveBeenCalled();
  });

  it("answers no more than a few addresses an hour from one network, before looking any up", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 90 });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 90 });
    expect(vi.mocked(consumeRateLimit).mock.calls[0]?.[1]).toBe("join-code:ip:203.0.113.9");
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(requestAccountEmailCode).not.toHaveBeenCalled();
  });

  it("refuses an address in the phone accounts' placeholder domain, which is nobody's inbox", async () => {
    expect(await requestJoinCode({ ...FIRST, email: "919820011223@phone.fynix.invalid" })).toEqual({ kind: "refused", message: "Enter a valid email address." });
    expect(requestAccountEmailCode).not.toHaveBeenCalled();
  });

  it("passes on a limit, and says so when email is not available or the message could not be sent", async () => {
    vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "limited", scope: "email", retryAfterSeconds: 300 });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "limited", scope: "email", retryAfterSeconds: 300 });
    vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "unavailable" });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "refused", message: "We can't email a code right now. Please try again later." });
    vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "failed" });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "refused", message: "We couldn't email that address. Check it and try again." });
  });
});

describe("createListingAccount", () => {
  it("opens the account only after the code is confirmed for that address, already verified, then signs the owner in with it", async () => {
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(confirmAccountEmailCode).toHaveBeenCalledWith({ otpId: OTP_ID, code: "123456", email: EMAIL }, "203.0.113.9", expect.any(Date));
    expect(createVerifiedEmailAccountWithGrant).toHaveBeenCalledWith(expect.anything(), DB, { email: EMAIL, name: "Meera Shah", password: "correct-horse-battery" });
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-2", businessName: "Smile Dental", signupChoice: "care" });
    expect(signInEmail).toHaveBeenCalledWith(expect.objectContaining({ body: { email: EMAIL, password: "correct-horse-battery" } }));
  });

  it("names the business after its owner when the sign-up gave no name for it", async () => {
    expect(await createListingAccount({ ...WITH_CODE, choice: "listing_only", businessName: null })).toEqual({ kind: "created" });
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-2", businessName: "Meera Shah", signupChoice: "listing_only" });
  });

  it("keeps an owner's choice of the Premium membership on the business it opens", async () => {
    expect(await createListingAccount({ ...WITH_CODE, choice: "premium" })).toEqual({ kind: "created" });
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-2", businessName: "Smile Dental", signupChoice: "premium" });
  });

  it("keeps proof that the owner agreed to the Terms and Privacy Notice, with the version they saw", async () => {
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(recordConsent).toHaveBeenCalledWith(DB, {
      subject: { type: "user", ref: "user-2" },
      purpose: "account_terms",
      noticeVersion: LEGAL_TEXT_VERSION,
      channel: "web",
    });
  });

  it("keeps no consent record for an account it did not open", async () => {
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "expired" });
    await createListingAccount(WITH_CODE);
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "confirmed" });
    vi.mocked(createVerifiedEmailAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(EMAIL));
    await createListingAccount(WITH_CODE);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("still opens the account and signs the owner in when the consent record cannot be written", async () => {
    vi.mocked(recordConsent).mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(signInEmail).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("consent"), expect.anything());
    logged.mockRestore();
  });

  it("still signs the owner in when the account somehow already has a business", async () => {
    vi.mocked(createUnlistedAccountBusiness).mockRejectedValue(new UserAlreadyHasBusinessError("user-2"));
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(signInEmail).toHaveBeenCalled();
  });

  it("opens nothing on a wrong code, and says how many tries are left", async () => {
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "wrong_code", triesLeft: 4 });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code isn't right. 4 tries left." });
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "wrong_code", triesLeft: null });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "wrong-code", message: "Enter a 6-digit code." });
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "expired" });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code has run out. Send a new one." });
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
  });

  it("passes on a confirmation limit, and opens nothing", async () => {
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 30 });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 30 });
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
  });

  it("opens nothing without a code", async () => {
    expect(await createListingAccount(FIRST)).toMatchObject({ kind: "refused" });
    expect(confirmAccountEmailCode).not.toHaveBeenCalled();
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
  });

  it("refuses a placeholder address before spending the code", async () => {
    expect(await createListingAccount({ ...WITH_CODE, email: "919820011223@phone.fynix.invalid" })).toEqual({ kind: "refused", message: "Enter a valid email address." });
    expect(confirmAccountEmailCode).not.toHaveBeenCalled();
  });

  it("sends an address that got an account in the meantime to sign in", async () => {
    vi.mocked(createVerifiedEmailAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(EMAIL));
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "refused", message: "This email already has an account. Sign in instead." });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("spends the network's account budget only once the address is proven", async () => {
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "wrong_code", triesLeft: 3 });
    await createListingAccount(WITH_CODE);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "confirmed" });
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 120 });
    expect(await createListingAccount(WITH_CODE)).toMatchObject({ kind: "refused" });
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
  });
});
