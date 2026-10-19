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
  discountFrom,
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

const PLAN = {
  id: "plan-inr",
  code: "care-inr",
  name: "Fynix care plan",
  tier: "premium",
  currency: "INR",
  initialAmountCents: 350_000,
  initialTermMonths: 1,
  recurringAmountCents: 350_000,
  includedPublishesPerMonth: 3,
  extraPublishAmountCents: 300,
  includedChangeHours: 1,
  extraHourAmountCents: 1_500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 500,
  providerPlanId: "plan_razorpay_inr",
  taxRateBasisPoints: 0,
} as const satisfies Plan;

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
  return { currency: "INR", tier: "premium", upgradePaid: false, subscription: null, hasEverPaid: false, paymentUnderReview: false, plan: PLAN, ...overrides };
}

const customer = {
  user: { phone: "+919820099101", email: "919820099101@phone.fynix.invalid" },
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

describe("discountFrom", () => {
  it("takes the code's own amount, with nothing to compute", () => {
    expect(discountFrom(code(), PLAN)).toEqual({
      codeId: "code-1",
      code: "SAVE15",
      amountCents: 52_500,
      stated: { kind: "amount", amountCents: 52_500 },
    });
  });

  it("resolves a percentage code against the plan's pre-tax price", () => {
    // 10% of ₹3,500 is ₹350; 12.5% is ₹437.50.
    const tenPercent = discountFrom(code({ discount: { kind: "percent", basisPoints: 1_000 } }), PLAN);
    expect(tenPercent).toMatchObject({ amountCents: 35_000, stated: { kind: "percent", basisPoints: 1_000 } });
    expect(discountFrom(code({ discount: { kind: "percent", basisPoints: 1_250 } }), PLAN)?.amountCents).toBe(43_750);
  });

  it("does not apply a code for another currency", () => {
    expect(discountFrom(code({ currency: "USD" }), PLAN)).toBeNull();
  });

  it("applies an affiliate code that gives no discount, worth nothing off the price", () => {
    expect(discountFrom(code({ affiliateId: "affiliate-1", discount: null }), PLAN)).toEqual({
      codeId: "code-1",
      code: "SAVE15",
      amountCents: 0,
      stated: null,
    });
  });

  it("does not apply a discount worth as much as the plan, which would leave nothing to charge", () => {
    expect(discountFrom(code({ discount: { kind: "amount", amountCents: 350_000 } }), PLAN)).toBeNull();
    expect(discountFrom(code({ discount: { kind: "amount", amountCents: 400_000 } }), PLAN)).toBeNull();
  });
});

describe("applyReferralCodeFor", () => {
  it("applies an affiliate's code for somebody else", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ affiliateId: "affiliate-1" }));
    vi.mocked(findAffiliateById).mockResolvedValue(PRIYA);
    expect((await applyReferralCodeFor(customer, "SAVE15", NOW)).kind).toBe("applied");
  });

  it("refuses an affiliate's own code on their own membership, and stores nothing", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ affiliateId: "affiliate-1" }));
    vi.mocked(findAffiliateById).mockResolvedValue({ ...PRIYA, phone: "+919820099101" });
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW))).toMatch(/your own/);
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("applies a good code and reports what it is worth", async () => {
    const outcome = await applyReferralCodeFor(customer, "  save15 ", NOW);
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
    const unknownCode = refusalOf(await applyReferralCodeFor(customer, "NOSUCHCODE", NOW));
    const inactive = refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW));
    const malformed = refusalOf(await applyReferralCodeFor(customer, "no", NOW));
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code({ currency: "USD" }));
    const wrongCurrency = refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW));

    expect(new Set([unknownCode, inactive, malformed, wrongCurrency]).size).toBe(1);
    expect(malformed).toContain("isn’t valid");
  });

  it("does not look a malformed code up at all", async () => {
    await applyReferralCodeFor(customer, "!!", NOW);
    expect(findRedeemableReferralCode).not.toHaveBeenCalled();
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("rate-limits attempts so codes cannot be guessed", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW))).toContain("lot of attempts");
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), `referral:business:${BUSINESS_ID}`, REFERRAL_RATE_LIMIT);
    expect(findRedeemableReferralCode).not.toHaveBeenCalled();
  });

  it("refuses once the business has paid, because the subscription's frozen discount decides the money", async () => {
    vi.mocked(findBillingState).mockResolvedValue(state({ hasEverPaid: true }));
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW))).toContain("already made");
    expect(setBusinessReferralCode).not.toHaveBeenCalled();
  });

  it("refuses when the business has no plan to discount", async () => {
    vi.mocked(findBillingState).mockResolvedValue(state({ plan: null }));
    expect(refusalOf(await applyReferralCodeFor(customer, "SAVE15", NOW))).toContain("nothing to apply");
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
    expect(await resolveAppliedDiscount(BUSINESS_ID, PLAN, NOW)).toMatchObject({ amountCents: 52_500 });
  });

  it("stops counting a code that has been retired since it was applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    expect(await resolveAppliedDiscount(BUSINESS_ID, PLAN, NOW)).toBeNull();
  });

  it("is null when no code is applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
    expect(await resolveAppliedDiscount(BUSINESS_ID, PLAN, NOW)).toBeNull();
  });
});

describe("isOwnAffiliateCode", () => {
  const AFFILIATE = { phone: "+919820011223", email: "priya@example.com" };

  it("matches the affiliate's own proven phone number", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: "+919820011223", email: "919820011223@phone.fynix.invalid" })).toBe(true);
  });

  it("matches the affiliate's email whatever its case", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: null, email: "Priya@Example.com" })).toBe(true);
  });

  it("does not match somebody else", () => {
    expect(isOwnAffiliateCode(AFFILIATE, { phone: "+919820099101", email: "rohan@example.com" })).toBe(false);
  });

  it("never matches on a phone account's placeholder email", () => {
    expect(
      isOwnAffiliateCode({ phone: null, email: "919820099101@phone.fynix.invalid" }, {
        phone: "+919820099101",
        email: "919820099101@phone.fynix.invalid",
      }),
    ).toBe(false);
  });
});

describe("findLapsedAppliedCode", () => {
  it("names a code that was applied but no longer works", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    await expect(findLapsedAppliedCode(BUSINESS_ID, PLAN, NOW)).resolves.toBe("SAVE15");
  });

  it("is null while the applied code still works, and when none is applied", async () => {
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code());
    await expect(findLapsedAppliedCode(BUSINESS_ID, PLAN, NOW)).resolves.toBeNull();
    vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
    await expect(findLapsedAppliedCode(BUSINESS_ID, PLAN, NOW)).resolves.toBeNull();
  });
});
