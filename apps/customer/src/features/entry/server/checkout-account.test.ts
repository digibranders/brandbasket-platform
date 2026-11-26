import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAlreadyExistsError, createPendingPasswordAccountWithGrant } from "@brandbasket/auth";
import { passwordPolicyProblem } from "@brandbasket/auth/password-policy";
import {
  createUnlistedAccountBusiness,
  findUserByEmail,
  recordSignupAttribution,
  recordSignupLead,
  saveBillingProfile,
  setUserPhoneNumber,
  UserAlreadyHasBusinessError,
  type Database,
} from "@brandbasket/db";
import type { CheckoutSignupInput } from "../rules/checkout-form";
import { getStaffDb } from "@/lib/db";
import { reportSignUpToAds } from "@/features/conversions/server";
import { recordAccountTermsConsent } from "./account-consent";
import { createCheckoutAccount, generateAccountPassword } from "./checkout-account";
import { signInCustomer } from "./customer-sign-in";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })) }));
vi.mock("@/lib/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: vi.fn(() => ({})) }));
vi.mock("@/features/conversions/server", () => ({ reportSignUpToAds: vi.fn(async () => undefined) }));
vi.mock("./customer-sign-in", () => ({ signInCustomer: vi.fn(async () => ({ userId: "user-1" })) }));
vi.mock("./account-consent", () => ({ recordAccountTermsConsent: vi.fn(async () => undefined) }));
vi.mock("@brandbasket/auth", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/auth")>("@brandbasket/auth");
  return { AccountAlreadyExistsError: actual.AccountAlreadyExistsError, createPendingPasswordAccountWithGrant: vi.fn() };
});
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    isPhoneAccountEmail: actual.isPhoneAccountEmail,
    UserAlreadyHasBusinessError: actual.UserAlreadyHasBusinessError,
    createUnlistedAccountBusiness: vi.fn(),
    findUserByEmail: vi.fn(),
    saveBillingProfile: vi.fn(),
    setUserPhoneNumber: vi.fn(),
    recordSignupLead: vi.fn(),
    recordSignupAttribution: vi.fn(),
  };
});

const DB = {} as Database;
const EMAIL = "meera@example.test";
const INPUT: CheckoutSignupInput = {
  services: ["managed-website"],
  billing: "monthly",
  name: "Meera Shah",
  businessName: "Shah Sweets",
  email: EMAIL,
  phone: { country: "IN", number: "98200 11223" },
  country: "IN",
  stateCode: "mh",
  gstinDetails: null,
  agreed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(findUserByEmail).mockResolvedValue(null);
  vi.mocked(createPendingPasswordAccountWithGrant).mockResolvedValue({ userId: "user-1", email: EMAIL });
  vi.mocked(createUnlistedAccountBusiness).mockResolvedValue({ businessId: "business-1" });
  vi.mocked(setUserPhoneNumber).mockResolvedValue(true);
  vi.mocked(recordSignupLead).mockResolvedValue({ id: "lead-1" });
  vi.mocked(recordSignupAttribution).mockResolvedValue(true);
});

describe("generateAccountPassword", () => {
  it("always meets the password policy and is never the same twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const password = generateAccountPassword();
      expect(passwordPolicyProblem(password)).toBeNull();
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });
});

describe("createCheckoutAccount", () => {
  it("opens a pending account and a managed business with the country, state and currency, then signs in", async () => {
    await expect(createCheckoutAccount(INPUT, null)).resolves.toEqual({ kind: "created", userId: "user-1", businessId: "business-1" });
    const account = vi.mocked(createPendingPasswordAccountWithGrant).mock.calls[0]?.[2];
    expect(account).toMatchObject({ email: EMAIL, name: "Meera Shah" });
    expect(passwordPolicyProblem(account?.password ?? "")).toBeNull();
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, {
      userId: "user-1",
      businessName: "Shah Sweets",
      signupChoice: "managed",
      countryCode: "IN",
      stateCode: "mh",
      currency: "INR",
    });
    expect(setUserPhoneNumber).toHaveBeenCalledWith(DB, "user-1", "+919820011223");
    expect(recordAccountTermsConsent).toHaveBeenCalledWith(DB, "user-1");
    expect(recordSignupLead).toHaveBeenCalledWith(DB, expect.objectContaining({ businessId: "business-1", email: EMAIL, phone: "+919820011223" }));
    expect(signInCustomer).toHaveBeenCalledWith({ email: EMAIL, password: account?.password }, expect.any(Headers));
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });

  it("bills a visitor outside India in dollars with no state", async () => {
    await createCheckoutAccount({ ...INPUT, country: "AE", stateCode: null, phone: { country: "AE", number: "50 123 4567" } }, null);
    expect(createUnlistedAccountBusiness).toHaveBeenCalledWith(DB, expect.objectContaining({ countryCode: "AE", stateCode: null, currency: "USD" }));
  });

  it("saves the billing profile only with a GSTIN", async () => {
    const details = {
      legalName: "Shah Sweets Pvt Ltd",
      gstin: "27AAPFU0939F1ZV",
      addressLine1: "12 Market Road",
      addressLine2: null,
      city: "Mumbai",
      postalCode: "400001",
      stateCode: "mh",
      email: null,
      phone: null,
    };
    await createCheckoutAccount({ ...INPUT, gstinDetails: details }, null);
    expect(saveBillingProfile).toHaveBeenCalledWith(DB, { businessId: "business-1", ...details });
  });

  it("keeps which ad the sign-up came from", async () => {
    const attribution = { campaign: "diwali" } as unknown as Parameters<typeof createCheckoutAccount>[1];
    await createCheckoutAccount(INPUT, attribution);
    expect(recordSignupAttribution).toHaveBeenCalledWith(DB, "business-1", attribution);
    expect(reportSignUpToAds).toHaveBeenCalledWith(attribution);
  });

  it("creates nothing for an address that already has an account", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-0" } as Awaited<ReturnType<typeof findUserByEmail>>);
    await expect(createCheckoutAccount(INPUT, null)).resolves.toEqual({ kind: "exists" });
    expect(createPendingPasswordAccountWithGrant).not.toHaveBeenCalled();
    expect(createUnlistedAccountBusiness).not.toHaveBeenCalled();
    expect(signInCustomer).not.toHaveBeenCalled();
  });

  it("treats a lost race on the address as an existing account", async () => {
    vi.mocked(createPendingPasswordAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(INPUT.email));
    await expect(createCheckoutAccount(INPUT, null)).resolves.toEqual({ kind: "exists" });
    expect(createUnlistedAccountBusiness).not.toHaveBeenCalled();
  });

  it("refuses a number the country could not have, before anything is created", async () => {
    const outcome = await createCheckoutAccount({ ...INPUT, phone: { country: "IN", number: "123" } }, null);
    expect(outcome).toMatchObject({ kind: "refused", field: "phone" });
    expect(createPendingPasswordAccountWithGrant).not.toHaveBeenCalled();
  });

  it("still signs in when the account already has a business", async () => {
    vi.mocked(createUnlistedAccountBusiness).mockRejectedValue(new UserAlreadyHasBusinessError("user-1"));
    await expect(createCheckoutAccount(INPUT, null)).resolves.toEqual({ kind: "created", userId: "user-1", businessId: null });
    expect(signInCustomer).toHaveBeenCalled();
  });
});
