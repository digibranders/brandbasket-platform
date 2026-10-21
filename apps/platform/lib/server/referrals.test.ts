import {
  consumeRateLimit,
  findAffiliateById,
  findBillingState,
  findBusinessReferralCode,
  findRedeemableReferralCode,
  setBusinessReferralCode,
  type Affiliate,
  type BillingState,
  type Database,
  type Plan,
  type ReferralCode,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import {
  applyReferralCodeFor,
  codeBasisFor,
  discountFrom,
  findCodeRefusedOnPackage,
  findLapsedAppliedCode,
  isOwnAffiliateCode,
  removeReferralCodeFor,
  REFERRAL_RATE_LIMIT,
  resolveAppliedDiscount,
} from "./referrals";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", async () => ({
  // The real placeholder rule, so the self-referral check is tested against it.
  isPhoneAccountEmail: (await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")).isPhoneAccountEmail,
  consumeRateLimit: vi.fn(),
  findAffiliateById: vi.fn(),
  findBillingState: vi.fn(),
  findBusinessReferralCode: vi.fn(),
  findRedeemableReferralCode: vi.fn(),
  setBusinessReferralCode: vi.fn(),
}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-09-22T12:00:00.000Z");

/** The services plan of migration 0184: the subscription's terms at a price of 0, every service a line. */
const PLAN = {
  id: "plan-inr",
  code: "services-inr-2026-10",
  name: "Brandbasket services",
  tier: "managed",
  currency: "INR",
  initialAmountCents: 0,
  initialTermMonths: 1,
  recurringAmountCents: 0,
  includedPublishesPerMonth: 3,
  extraPublishAmountCents: 300,
  includedChangeHours: 1,
  extraHourAmountCents: 1_500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 500,
  providerPlanId: "plan_razorpay_inr",
  taxRateBasisPoints: 1_800,
} as const satisfies Plan;

/** What a code is priced against on a Managed Website subscription: the website's ₹2,999 list price. */
const WEBSITE = { currency: "INR", listCents: 299_900 } as const;
const WEBSITE_ALONE = ["managed-website"] as const;

function code(overrides: Partial<ReferralCode> = {}): ReferralCode {
  return {
    id: "code-1",
    code: "SAVE15",
    currency: "INR",
    affiliateId: null,
    discount: { kind: "amount", amountCents: 52_500 },
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    createdAt: NOW,
    ...overrides,
  };
}

function state(overrides: Partial<BillingState> = {}): BillingState {
  return { currency: "INR", tier: "managed", upgradePaid: false, subscription: null, hasEverPaid: false, paymentUnderReview: false, plan: PLAN, ...overrides };
}

const customer = {
  user: { phone: "+919820099101", email: "919820099101@phone.brandbasket.invalid" },
  tenant: { businessId: BUSINESS_ID },
} as unknown as GrantedCustomer;

const PRIYA = { id: "affiliate-1", phone: "+919820011223", email: "priya@example.com", active: true } as Affiliate;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app" } as unknown as Database);
  vi.mocked(getStaffDb).mockReturnValue({ name: "staff" } as unknown as Database);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
  vi.mocked(findBillingState).mockResolvedValue(state());
  vi.mocked(findRedeemableReferralCode).mockResolvedValue(code());
  vi.mocked(setBusinessReferralCode).mockResolvedValue(true);
});

function refusalOf(outcome: Awaited<ReturnType<typeof applyReferralCodeFor>>): string {
  if (outcome.kind !== "refused") throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  return outcome.problem.message;
}

describe("codeBasisFor", () => {
  it("is the one service's list price for a single-service basket", () => {
    expect(codeBasisFor(["managed-website"], "INR")).toEqual(WEBSITE);
    expect(codeBasisFor(["local-seo-aeo"], "USD")).toEqual({ currency: "USD", listCents: 35_000 });
  });

  it("is null for a package, which never takes a code, and for no services at all", () => {
    expect(codeBasisFor(["managed-website", "digital-growth"], "INR")).toBeNull();
    expect(codeBasisFor([], "INR")).toBeNull();
  });
});

describe("discountFrom", () => {
  it("takes the code's own amount, with nothing to compute", () => {
    expect(discountFrom(code(), WEBSITE)).toEqual({
      codeId: "code-1",
      code: "SAVE15",
      amountCents: 52_500,
      stated: { kind: "amount", amountCents: 52_500 },
    });
  });

  it("resolves a percentage code against the service's pre-tax list price, not the plan's 0", () => {
    // 10% of ₹2,999 is ₹299.90; 12.5% is ₹374.88 (half a paisa up).
    const tenPercent = discountFrom(code({ discount: { kind: "percent", basisPoints: 1_000 } }), WEBSITE);
    expect(tenPercent).toMatchObject({ amountCents: 29_990, stated: { kind: "percent", basisPoints: 1_000 } });
    expect(discountFrom(code({ discount: { kind: "percent", basisPoints: 1_250 } }), WEBSITE)?.amountCents).toBe(37_488);
    // 10% of Local SEO + AEO's ₹24,999.
    expect(discountFrom(code({ discount: { kind: "percent", basisPoints: 1_000 } }), { currency: "INR", listCents: 2_499_900 })?.amountCents).toBe(249_990);
  });

  it("does not apply a code for another currency", () => {
    expect(discountFrom(code({ currency: "USD" }), WEBSITE)).toBeNull();
  });

  it("applies an affiliate code that gives no discount, worth nothing off the price", () => {
    expect(discountFrom(code({ affiliateId: "affiliate-1", discount: null }), WEBSITE)).toEqual({
      codeId: "code-1",
      code: "SAVE15",
      amountCents: 0,
      stated: null,
    });
  });

  it("does not apply a discount worth as much as the service, which would leave nothing to charge", () => {
    expect(discountFrom(code({ discount: { kind: "amount", amountCents: 299_900 } }), WEBSITE)).toBeNull();
    expect(discountFrom(code({ discount: { kind: "amount", amountCents: 400_000 } }), WEBSITE)).toBeNull();
  });
});

describe("applyReferralCodeFor", () => {
  it("applies an affiliate's code for somebody else", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ affiliateId: "affiliate-1" }));
    vi.mocked(findAffiliateById).mockResolvedValue(PRIYA);
    expect((await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW)).kind).toBe("applied");
  });

  it("refuses an affiliate's own code on their own membership, and stores nothing", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ affiliateId: "affiliate-1" }));
    vi.mocked(findAffiliateById).mockResolvedValue({ ...PRIYA, phone: "+919820099101" });
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW))).toMatch(/your own/);
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("applies a good code and reports what it is worth", async () => {
    const outcome = await applyReferralCodeFor(customer, "  save15 ", WEBSITE_ALONE, NOW);
    expect(outcome).toEqual({
      kind: "applied",
      discount: {
        codeId: "code-1",
        code: "SAVE15",
        amountCents: 52_500,
        stated: { kind: "amount", amountCents: 52_500 },
      },
    });
    expect(findRedeemableReferralCode).toHaveBeenCalledWith(expect.anything(), {
      code: "SAVE15",
      currency: "INR",
      now: NOW,
    });
    expect(setBusinessReferralCode).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS_ID,
      referralCodeId: "code-1",
    });
  });

  it("gives one message for every way a code can fail, so the field is not an oracle", async () => {
    // A code that does not exist, and one that exists but is inactive, expired or capped, both come back as null
    // from findRedeemableReferralCode, which is the point. This layer cannot tell them apart either.
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    const unknownCode = refusalOf(await applyReferralCodeFor(customer, "NOSUCHCODE", WEBSITE_ALONE, NOW));
    const inactive = refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW));
    const malformed = refusalOf(await applyReferralCodeFor(customer, "no", WEBSITE_ALONE, NOW));
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ currency: "USD" }));
    const wrongCurrency = refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW));

    expect(new Set([unknownCode, inactive, malformed, wrongCurrency]).size).toBe(1);
    expect(malformed).toContain("isn’t valid");
  });

  it("does not look a malformed code up at all", async () => {
    await applyReferralCodeFor(customer, "!!", WEBSITE_ALONE, NOW);
    expect(findRedeemableReferralCode).not.toHaveBeenCalled();
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("rate-limits attempts so codes cannot be guessed", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW))).toContain("lot of attempts");
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), `referral:business:${BUSINESS_ID}`, REFERRAL_RATE_LIMIT);
    expect(findRedeemableReferralCode).not.toHaveBeenCalled();
  });

  it("refuses once the business has paid, because the subscription's frozen discount decides the money", async () => {
    vi.mocked(findBillingState).mockResolvedValue(state({ hasEverPaid: true }));
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW))).toContain("already made");
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a code on a package of two or more services, and stores nothing", async () => {
    const refusal = refusalOf(await applyReferralCodeFor(customer, "SAVE15", ["managed-website", "local-seo-aeo"], NOW));
    expect(refusal).toBe("A code can only be used on a single service, not on a package.");
    expect(findRedeemableReferralCode).not.toHaveBeenCalled();
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("prices a code on a single service against that service's list price", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ discount: { kind: "percent", basisPoints: 1_000 } }));
    const outcome = await applyReferralCodeFor(customer, "SAVE15", ["digital-growth"], NOW);
    // 10% of Social Media and Ads' ₹9,999.
    expect(outcome).toMatchObject({ kind: "applied", discount: { amountCents: 99_990 } });
  });

  it("refuses a code worth as much as the one service, which would leave nothing to charge", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ discount: { kind: "amount", amountCents: 299_900 } }));
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW))).toContain("isn’t valid");
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("refuses when the business has no plan to discount", async () => {
    vi.mocked(findBillingState).mockResolvedValue(state({ plan: null }));
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", WEBSITE_ALONE, NOW))).toContain("nothing to apply");
  });
});

describe("removeReferralCodeFor", () => {
  it("takes the code off", async () => {
    expect(await removeReferralCodeFor(customer)).toEqual({ kind: "removed" });
    expect(setBusinessReferralCode).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS_ID,
      referralCodeId: null,
    });
  });

  it("refuses once the business has paid", async () => {
    vi.mocked(findBillingState).mockResolvedValue(state({ hasEverPaid: true }));
    const outcome = await removeReferralCodeFor(customer);
    expect(outcome.kind).toBe("refused");
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });
});

describe("resolveAppliedDiscount", () => {
  it("re-validates the applied code rather than trusting it", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    expect(await resolveAppliedDiscount(BUSINESS_ID, WEBSITE, NOW)).toMatchObject({ amountCents: 52_500 });
  });

  it("stops counting a code that has been retired since it was applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    expect(await resolveAppliedDiscount(BUSINESS_ID, WEBSITE, NOW)).toBeNull();
  });

  it("is null when no code is applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
    expect(await resolveAppliedDiscount(BUSINESS_ID, WEBSITE, NOW)).toBeNull();
  });
});

describe("isOwnAffiliateCode", () => {
  const AFFILIATE = { phone: "+919820011223", email: "priya@example.com" };

  it("matches the affiliate's own proven phone number", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: "+919820011223", email: "919820011223@phone.brandbasket.invalid" })).toBe(true);
  });

  it("matches the affiliate's email whatever its case", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: null, email: "Priya@Example.com" })).toBe(true);
  });

  it("does not match somebody else", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: "+919820099101", email: "rohan@example.com" })).toBe(false);
  });

  it("never matches on a phone account's placeholder email", () => {
    expect(
      isOwnAffiliateCode({ phone: null, email: "919820099101@phone.brandbasket.invalid" }, {
        phone: "+919820099101",
        email: "919820099101@phone.brandbasket.invalid",
      }),
    ).toBe(false);
  });
});

describe("findLapsedAppliedCode", () => {
  it("names a code that was applied but no longer works", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    await expect(findLapsedAppliedCode(BUSINESS_ID, WEBSITE, NOW)).resolves.toBe("SAVE15");
  });

  it("is null while the applied code still works, and when none is applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    await expect(findLapsedAppliedCode(BUSINESS_ID, WEBSITE, NOW)).resolves.toBeNull();
    vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
    await expect(findLapsedAppliedCode(BUSINESS_ID, WEBSITE, NOW)).resolves.toBeNull();
  });
});

describe("findCodeRefusedOnPackage", () => {
  const PACKAGE = ["managed-website", "digital-growth"] as const;

  it("names the working code a business applied when the basket is a package, which never takes one", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    await expect(findCodeRefusedOnPackage(BUSINESS_ID, PACKAGE, "INR", NOW)).resolves.toBe("SAVE15");
    expect(findRedeemableReferralCode).toHaveBeenCalledWith({ name: "staff" }, { code: "SAVE15", currency: "INR", now: NOW });
  });

  it("is null for a single service, without looking the code up", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    await expect(findCodeRefusedOnPackage(BUSINESS_ID, WEBSITE_ALONE, "INR", NOW)).resolves.toBeNull();
    expect(findBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("is null when no code is applied, and when the applied one no longer works", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
    await expect(findCodeRefusedOnPackage(BUSINESS_ID, PACKAGE, "INR", NOW)).resolves.toBeNull();
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    await expect(findCodeRefusedOnPackage(BUSINESS_ID, PACKAGE, "INR", NOW)).resolves.toBeNull();
  });
});
