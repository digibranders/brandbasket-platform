import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAlreadyExistsError, createPhoneAccountWithGrant, createVerifiedEmailAccountWithGrant } from "@fynix/auth";
import {
  consumeRateLimit,
  createListingAccountBusiness,
  createUnlistedAccountBusiness,
  findClaimablePlace,
  findUserByEmail,
  findUserByPhone,
  PlaceNotClaimableError,
  recordConsent,
  type Database,
} from "@fynix/db";
import { LEGAL_TEXT_VERSION } from "@fynix/shared/lib/privacy/notice-version";
import type { JoinInput } from "@/lib/join-form";
import { confirmAccountEmailCode, requestAccountEmailCode } from "./account-email-code";
import { confirmAccountOtp, requestAccountOtp } from "./account-otp";
import { getAuth } from "./auth";
import { hasValidClaimSignature } from "./claim-link";
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
vi.mock("./claim-link", () => ({ hasValidClaimSignature: vi.fn() }));
vi.mock("./account-otp", () => ({ requestAccountOtp: vi.fn(), confirmAccountOtp: vi.fn() }));
vi.mock("./account-email-code", () => ({ requestAccountEmailCode: vi.fn(), confirmAccountEmailCode: vi.fn() }));
vi.mock("@fynix/auth", async () => {
  const actual = await vi.importActual<typeof import("@fynix/auth")>("@fynix/auth");
  return { AccountAlreadyExistsError: actual.AccountAlreadyExistsError, createPhoneAccountWithGrant: vi.fn(), createVerifiedEmailAccountWithGrant: vi.fn() };
});
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return {
    marketOfListing: actual.marketOfListing,
    phoneAccountEmail: actual.phoneAccountEmail,
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
    UserAlreadyHasBusinessError: actual.UserAlreadyHasBusinessError,
    PlaceNotClaimableError: actual.PlaceNotClaimableError,
    findClaimablePlace: vi.fn(),
    consumeRateLimit: vi.fn(),
    createListingAccountBusiness: vi.fn(),
    createUnlistedAccountBusiness: vi.fn(),
    recordConsent: vi.fn(),
    findUserByPhone: vi.fn(),
    findUserByEmail: vi.fn(),
    addBusinessListing: vi.fn(),
    renameAddedBusiness: vi.fn(),
    setClaimWebsite: vi.fn(),
    updateAddedBusinessListing: vi.fn(),
  };
});

const DB = {} as Database;
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const E164 = "+919820011223";
const signInEmail = vi.fn();

const FIRST: JoinInput = { kind: "new", choice: "listing_only", businessName: null, name: "Meera Shah", phone: "98200 11223", password: "correct-horse-battery", agreed: true, code: null };
const WITH_CODE: JoinInput = { ...FIRST, code: { otpId: OTP_ID, code: "123456" } };
const CLAIM: JoinInput = {
  kind: "claim",
  choice: "listing_only",
  listing: "dentists/thane/naupada/smile-dental",
  businessName: "Smile Dental",
  signature: "sig",
  name: "Meera Shah",
  phone: "98200 11223",
  password: "correct-horse-battery",
  agreed: true,
  code: { otpId: OTP_ID, code: "123456" },
};

const PLACE_ID = "k7m2q9a";
const PLACE_KEY = "dentists/thane/naupada/smile-dental";
/** A claim link that names the business by its permanent id. */
const CLAIM_BY_ID: JoinInput = {
  kind: "claim",
  choice: "listing_only",
  placeId: PLACE_ID,
  businessName: "Smile Dental",
  signature: "sig",
  name: "Meera Shah",
  phone: "98200 11223",
  password: "correct-horse-battery",
  agreed: true,
  code: { otpId: OTP_ID, code: "123456" },
};
const OWNED_MESSAGE = "This business already has an owner. If it's yours, email us and we'll sort it out.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "claimable", placeId: PLACE_ID, listingKey: PLACE_KEY });
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(getAuth).mockReturnValue({ api: { signInEmail } } as unknown as ReturnType<typeof getAuth>);
  vi.mocked(hasValidClaimSignature).mockReturnValue(true);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(findUserByPhone).mockResolvedValue(null);
  vi.mocked(findUserByEmail).mockResolvedValue(null);
  vi.mocked(requestAccountEmailCode).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.test", confirmRequired: true });
  vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "confirmed" });
  vi.mocked(createVerifiedEmailAccountWithGrant).mockResolvedValue({ userId: "user-2", email: "meera.shah@example.test" });
  vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 1223", texted: true });
  vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "confirmed" });
  vi.mocked(createPhoneAccountWithGrant).mockResolvedValue({ userId: "user-1", email: "919820011223@phone.fynix.invalid" });
  vi.mocked(createUnlistedAccountBusiness).mockResolvedValue({ businessId: "business-1" });
  vi.mocked(createListingAccountBusiness).mockResolvedValue({ businessId: "business-1", claimId: "claim-1" });
  vi.mocked(recordConsent).mockResolvedValue(undefined);
});

describe("requestJoinCode", () => {
  it("texts a sign-up code to the number, read as an Indian one", async () => {
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "•••• 1223", via: "phone", texted: true } });
    expect(requestAccountOtp).toHaveBeenCalledWith({ purpose: "signup", phone: E164, send: true }, "203.0.113.9", expect.any(Date));
  });

  it("tells the form when no code was texted, so it does not say one was", async () => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 1223", texted: false });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "•••• 1223", via: "phone", texted: false } });
  });

  it("sends a number that already has an account to sign in, and texts nothing", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-0", name: "Meera", email: "919820011223@phone.fynix.invalid" });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "refused", message: "This number already has an account. Sign in instead." });
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  it("answers no more than a few numbers an hour from one network, so it cannot be used to look numbers up", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-0", name: "Meera", email: "919820011223@phone.fynix.invalid" });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 600 });
    expect(vi.mocked(consumeRateLimit).mock.calls[0]?.[1]).toBe("join-code:ip:203.0.113.9");
    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  it("refuses a number that is not one", async () => {
    expect(await requestJoinCode({ ...FIRST, phone: "12345" })).toMatchObject({ kind: "refused" });
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  it("refuses a claim the directory did not sign, before texting anyone", async () => {
    vi.mocked(hasValidClaimSignature).mockReturnValue(false);
    expect(await requestJoinCode({ ...CLAIM, code: null })).toMatchObject({ kind: "refused" });
    expect(requestAccountOtp).not.toHaveBeenCalled();
  });

  describe("a claim link that names the business by its permanent id", () => {
    it("texts a code once the id is signed and the place can be claimed", async () => {
      expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "•••• 1223", via: "phone", texted: true } });
      expect(hasValidClaimSignature).toHaveBeenCalledWith(PLACE_ID, "Smile Dental", "sig");
      expect(findClaimablePlace).toHaveBeenCalledWith(DB, PLACE_ID);
    });

    it("refuses an id the website did not sign, without looking the place up or texting anyone", async () => {
      vi.mocked(hasValidClaimSignature).mockReturnValue(false);
      expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({ kind: "refused", message: expect.stringContaining("couldn't find that business") });
      expect(findClaimablePlace).not.toHaveBeenCalled();
      expect(requestAccountOtp).not.toHaveBeenCalled();
    });

    it("refuses an id no place has, with the message of an unknown listing", async () => {
      vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "refused", reason: "unknown-place" });
      expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({ kind: "refused", message: expect.stringContaining("couldn't find that business") });
      expect(requestAccountOtp).not.toHaveBeenCalled();
    });

    it("refuses a place that already has an owner, a client or an added business, before texting anyone", async () => {
      for (const reason of ["already-claimed", "has-client-listing", "not-open-data"] as const) {
        vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "refused", reason });
        expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({ kind: "refused", message: OWNED_MESSAGE });
      }
      expect(requestAccountOtp).not.toHaveBeenCalled();
    });

    it("refuses a place with no address to take its market from, saying so", async () => {
      vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "refused", reason: "no-address" });
      expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({
        kind: "refused",
        message: "We can't take a claim for this business yet. Email us and we'll sort it out.",
      });
    });

    it("refuses a place whose address is in a category or area the directory does not list", async () => {
      vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "claimable", placeId: PLACE_ID, listingKey: "dentists/thane/nowhere-in-particular/smile-dental" });
      expect(await requestJoinCode({ ...CLAIM_BY_ID, code: null })).toEqual({
        kind: "refused",
        message: "We can't take a claim for this business yet. Email us and we'll sort it out.",
      });
      expect(requestAccountOtp).not.toHaveBeenCalled();
    });

    it("leaves a claim by listing key as it was: no place lookup", async () => {
      expect(await requestJoinCode({ ...CLAIM, code: null })).toMatchObject({ kind: "code" });
      expect(hasValidClaimSignature).toHaveBeenCalledWith("dentists/thane/naupada/smile-dental", "Smile Dental", "sig");
      expect(findClaimablePlace).not.toHaveBeenCalled();
    });
  });

  it("says so when texting is limited or not available", async () => {
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "limited", scope: "global", retryAfterSeconds: 137 });
    expect(await requestJoinCode(FIRST)).toEqual({ kind: "limited", scope: "global", retryAfterSeconds: 137 });
    vi.mocked(requestAccountOtp).mockResolvedValue({ kind: "unavailable" });
    expect(await requestJoinCode(FIRST)).toMatchObject({ kind: "refused" });
  });
});

describe("createListingAccount", () => {
  it("opens the account only after the code is confirmed for that number, then signs the owner in", async () => {
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(confirmAccountOtp).toHaveBeenCalledWith(
      { otpId: OTP_ID, code: "123456", purpose: "signup", phone: E164 },
      "203.0.113.9",
      expect.any(Date),
    );
    expect(createPhoneAccountWithGrant).toHaveBeenCalledWith(expect.anything(), DB, { phone: E164, name: "Meera Shah", password: "correct-horse-battery" });
    // A business that is not in the directory yet is named after its owner until they add it.
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-1", businessName: "Meera Shah", signupChoice: "listing_only" });
    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "919820011223@phone.fynix.invalid", password: "correct-horse-battery" } }),
    );
  });

  it("keeps proof that the owner agreed to the Terms and Privacy Notice, with the version they saw", async () => {
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "created" });
    expect(recordConsent).toHaveBeenCalledWith(DB, {
      subject: { type: "user", ref: "user-1" },
      purpose: "account_terms",
      noticeVersion: LEGAL_TEXT_VERSION,
      channel: "web",
    });
  });

  it("keeps no consent record for an account it did not open", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "expired" });
    await createListingAccount(WITH_CODE);
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "confirmed" });
    vi.mocked(createPhoneAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(E164));
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

  it("claims the listing with the number that was just proven", async () => {
    expect(await createListingAccount(CLAIM)).toEqual({ kind: "created" });
    expect(createListingAccountBusiness).toHaveBeenCalledWith(DB, {
      userId: "user-1",
      businessName: "Smile Dental",
      listingKey: "dentists/thane/naupada/smile-dental",
      phone: E164,
      signupChoice: "listing_only",
    });
  });

  it("claims the place a link's id names, with the number that was just proven", async () => {
    expect(await createListingAccount(CLAIM_BY_ID)).toEqual({ kind: "created" });
    expect(createListingAccountBusiness).toHaveBeenCalledWith(DB, {
      userId: "user-1",
      businessName: "Smile Dental",
      placeId: PLACE_ID,
      phone: E164,
      signupChoice: "listing_only",
    });
    expect(signInEmail).toHaveBeenCalled();
  });

  it("opens nothing for an id that is not signed, or whose place cannot be claimed", async () => {
    vi.mocked(hasValidClaimSignature).mockReturnValue(false);
    expect(await createListingAccount(CLAIM_BY_ID)).toMatchObject({ kind: "refused" });
    vi.mocked(hasValidClaimSignature).mockReturnValue(true);
    vi.mocked(findClaimablePlace).mockResolvedValue({ kind: "refused", reason: "already-claimed" });
    expect(await createListingAccount(CLAIM_BY_ID)).toEqual({ kind: "refused", message: OWNED_MESSAGE });
    expect(confirmAccountOtp).not.toHaveBeenCalled();
    expect(createPhoneAccountWithGrant).not.toHaveBeenCalled();
  });

  it("keeps the new account when the place is claimed in the meantime: the business opens with no claim, to add on the Listing page", async () => {
    vi.mocked(createListingAccountBusiness).mockRejectedValue(new PlaceNotClaimableError(PLACE_ID, "already-claimed"));
    expect(await createListingAccount(CLAIM_BY_ID)).toEqual({ kind: "created" });
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-1", businessName: "Smile Dental", signupChoice: "listing_only" });
    expect(signInEmail).toHaveBeenCalled();
  });

  it("keeps an owner's choice of the Premium membership on the business it opens", async () => {
    expect(await createListingAccount({ ...WITH_CODE, kind: "new", choice: "premium", businessName: "Smile Dental" })).toEqual({ kind: "created" });
    // A Premium sign-up names its business, so the checkout, the receipt and our team never call it by its owner's name.
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-1", businessName: "Smile Dental", signupChoice: "premium" });
  });

  it("opens nothing on a wrong code, and says how many tries are left", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "wrong_code", triesLeft: 3 });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code isn't right. 3 tries left." });
    expect(createPhoneAccountWithGrant).not.toHaveBeenCalled();
  });

  it("asks for a new code when this one has run out", async () => {
    vi.mocked(confirmAccountOtp).mockResolvedValue({ kind: "expired" });
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code has run out. Send a new one." });
    expect(createPhoneAccountWithGrant).not.toHaveBeenCalled();
  });

  it("opens nothing without a code", async () => {
    expect(await createListingAccount(FIRST)).toMatchObject({ kind: "refused" });
    expect(confirmAccountOtp).not.toHaveBeenCalled();
    expect(createPhoneAccountWithGrant).not.toHaveBeenCalled();
  });

  it("sends a number that got an account in the meantime to sign in", async () => {
    vi.mocked(createPhoneAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(E164));
    expect(await createListingAccount(WITH_CODE)).toEqual({ kind: "refused", message: "This number already has an account. Sign in instead." });
    expect(signInEmail).not.toHaveBeenCalled();
  });
});

describe("an email sign-up (the Fynix account)", () => {
  const EMAIL = "meera.shah@example.test";
  const BY_EMAIL: JoinInput = { kind: "new", choice: "care", businessName: "Smile Dental", name: "Meera Shah", email: EMAIL, password: "correct-horse-battery", agreed: true, code: null };
  const BY_EMAIL_WITH_CODE: JoinInput = { ...BY_EMAIL, code: { otpId: OTP_ID, code: "123456" } };

  describe("requestJoinCode", () => {
    it("emails a sign-up code to the address, and no text goes anywhere", async () => {
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "code", otp: { otpId: OTP_ID, phoneHint: "m•••@example.test", via: "email", texted: true } });
      expect(requestAccountEmailCode).toHaveBeenCalledWith({ email: EMAIL }, "203.0.113.9", expect.any(Date));
      expect(requestAccountOtp).not.toHaveBeenCalled();
    });

    it("tells the form when no code has to be read, so it does not say one must be", async () => {
      vi.mocked(requestAccountEmailCode).mockResolvedValue({ kind: "sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.test", confirmRequired: false });
      expect(await requestJoinCode(BY_EMAIL)).toMatchObject({ kind: "code", otp: { via: "email", texted: false } });
    });

    it("sends an address that already has an account to sign in, and emails nothing", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", name: "Meera", email: EMAIL });
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "refused", message: "This email already has an account. Sign in instead." });
      expect(requestAccountEmailCode).not.toHaveBeenCalled();
    });

    it("answers no more than a few addresses an hour from one network, before looking any up", async () => {
      vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 90 });
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 90 });
      expect(findUserByEmail).not.toHaveBeenCalled();
      expect(requestAccountEmailCode).not.toHaveBeenCalled();
    });

    it("refuses an address in the phone accounts' placeholder domain", async () => {
      expect(await requestJoinCode({ ...BY_EMAIL, email: "919820011223@phone.fynix.invalid" })).toEqual({ kind: "refused", message: "Enter a valid email address." });
      expect(requestAccountEmailCode).not.toHaveBeenCalled();
    });

    it("takes no claim of a listing, which is proven by a call to its mobile number", async () => {
      expect(await requestJoinCode({ ...CLAIM, phone: undefined, email: EMAIL, code: null })).toMatchObject({ kind: "refused" });
      expect(requestAccountEmailCode).not.toHaveBeenCalled();
    });

    it("passes on a limit, and says so when email is not available or the message could not be sent", async () => {
      vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "limited", scope: "email", retryAfterSeconds: 300 });
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "limited", scope: "email", retryAfterSeconds: 300 });
      vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "unavailable" });
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "refused", message: "We can't email a code right now. Please try again later." });
      vi.mocked(requestAccountEmailCode).mockResolvedValueOnce({ kind: "failed" });
      expect(await requestJoinCode(BY_EMAIL)).toEqual({ kind: "refused", message: "We couldn't email that address. Check it and try again." });
    });
  });

  describe("createListingAccount", () => {
    it("opens the account only after the code is confirmed for that address, already verified, then signs the owner in with it", async () => {
      expect(await createListingAccount(BY_EMAIL_WITH_CODE)).toEqual({ kind: "created" });
      expect(confirmAccountEmailCode).toHaveBeenCalledWith({ otpId: OTP_ID, code: "123456", email: EMAIL }, "203.0.113.9", expect.any(Date));
      expect(createVerifiedEmailAccountWithGrant).toHaveBeenCalledWith(expect.anything(), DB, { email: EMAIL, name: "Meera Shah", password: "correct-horse-battery" });
      expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, { userId: "user-2", businessName: "Smile Dental", signupChoice: "care" });
      expect(signInEmail).toHaveBeenCalledWith(expect.objectContaining({ body: { email: EMAIL, password: "correct-horse-battery" } }));
      expect(createPhoneAccountWithGrant).not.toHaveBeenCalled();
      expect(confirmAccountOtp).not.toHaveBeenCalled();
    });

    it("keeps proof that the owner agreed to the Terms and Privacy Notice", async () => {
      await createListingAccount(BY_EMAIL_WITH_CODE);
      expect(recordConsent).toHaveBeenCalledWith(DB, expect.objectContaining({ subject: { type: "user", ref: "user-2" }, purpose: "account_terms" }));
    });

    it("opens nothing on a wrong code, and says how many tries are left", async () => {
      vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "wrong_code", triesLeft: 4 });
      expect(await createListingAccount(BY_EMAIL_WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code isn't right. 4 tries left." });
      vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "expired" });
      expect(await createListingAccount(BY_EMAIL_WITH_CODE)).toEqual({ kind: "wrong-code", message: "That code has run out. Send a new one." });
      expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
    });

    it("passes on a confirmation limit, and opens nothing", async () => {
      vi.mocked(confirmAccountEmailCode).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 30 });
      expect(await createListingAccount(BY_EMAIL_WITH_CODE)).toEqual({ kind: "limited", scope: "network", retryAfterSeconds: 30 });
      expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
    });

    it("opens nothing without a code", async () => {
      expect(await createListingAccount(BY_EMAIL)).toMatchObject({ kind: "refused" });
      expect(confirmAccountEmailCode).not.toHaveBeenCalled();
    });

    it("sends an address that got an account in the meantime to sign in", async () => {
      vi.mocked(createVerifiedEmailAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(EMAIL));
      expect(await createListingAccount(BY_EMAIL_WITH_CODE)).toEqual({ kind: "refused", message: "This email already has an account. Sign in instead." });
      expect(signInEmail).not.toHaveBeenCalled();
      expect(recordConsent).not.toHaveBeenCalled();
    });
  });
});
