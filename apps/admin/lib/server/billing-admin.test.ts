import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  findActivePlan,
  findBillingState,
  findBundledAddOnsForSubscription,
  findBusinessReferralCode,
  findLatestActivatedSubscriptionForBusiness,
  findLatestSubscriptionForBusiness,
  findRedeemableReferralCode,
  isPackageOfferForfeited,
  lockBusinessForBilling,
  markPackageOfferForfeited,
  openCheckoutSubscription,
  openMembershipForListingBusiness,
  findAffiliateAccrualContext,
  recordPaymentAndActivate,
  resolvePaymentAttention,
  type BillingState,
  type BundledAddOn,
  type ReferralCode,
  type Database,
  type Payment,
  type Plan,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getBillingProvider } from "./billing-provider";
import { activateFirstPayment } from "@brandbasket/shared/server/billing-activation";
import { recordManualFirstPayment, resolveFlaggedPayment, type ManualFirstPayment } from "./billing-admin";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";

// The real activation runs against a double of recordPaymentAndActivate, whose one-transaction and idempotency
// guarantees are proven in packages/db. What is checked here is the dates and amounts it is handed, and how the
// manual payment treats each state a business can be in.
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./billing-provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
// Invoicing is covered by the payment invoicing integration test; here an invoice failure must not be the logged error.
vi.mock("@brandbasket/shared/server/tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn(async () => null) }));
vi.mock("@brandbasket/db", () => {
  class MockBillingBusinessNotFoundError extends Error {}
  return {
    BillingBusinessNotFoundError: MockBillingBusinessNotFoundError,
    activateBundledAddOns: vi.fn(async () => []),
    bundledNetCents: (items: readonly { netAmountCents: number }[]) => items.reduce((total, item) => total + item.netAmountCents, 0),
    findActivePlan: vi.fn(),
    findBundledAddOnsForSubscription: vi.fn(async () => []),
    findAffiliateAccrualContext: vi.fn(),
    findBillingState: vi.fn(),
    findBusinessReferralCode: vi.fn(),
    findLatestActivatedSubscriptionForBusiness: vi.fn(),
    findLatestSubscriptionForBusiness: vi.fn(),
    findRedeemableReferralCode: vi.fn(),
    isPackageOfferForfeited: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    markPackageOfferForfeited: vi.fn(),
    openCheckoutSubscription: vi.fn(),
    openMembershipForListingBusiness: vi.fn(),
    recordPaymentAndActivate: vi.fn(),
    resolvePaymentAttention: vi.fn(),
  };
});

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-09-16T12:00:00.000Z");
const tx = { name: "staff-tx" } as unknown as ScopedTransaction;

const USD = {
  id: "plan-usd",
  currency: "USD",
  initialAmountCents: 7500,
  taxRateBasisPoints: 0,
  initialTermMonths: 1,
  recurringAmountCents: 7500,
} as Plan;
const INR = {
  id: "plan-inr",
  currency: "INR",
  initialAmountCents: 350000,
  taxRateBasisPoints: 0,
  initialTermMonths: 1,
  recurringAmountCents: 350000,
} as Plan;

/** The services plan of migration 0184: the subscription's terms at a price of 0, every service a line. */
const SERVICES_USD = { ...USD, initialAmountCents: 0, recurringAmountCents: 0 } as Plan;
/** The website line a manual payment buys: $75 a month, no tax of ours. */
const WEBSITE_USD_LINE = { addOn: "managed-website", listAmountCents: 7_500, offerDiscountAmountCents: 0, netAmountCents: 7_500, taxRateBasisPoints: 0 };

let outcome: "committed" | "rolled back" | null;
let events: string[];
let provider: BillingProvider;
let cancelled: MockInstance<BillingProvider["cancelSubscription"]>;
let logged: MockInstance<typeof console.error>;

const MANUAL: ManualFirstPayment = {
  businessId: BUSINESS_ID,
  staffUserId: "staff-1",
  reference: "HDFC-UTR-000123",
  receivedOn: "2026-09-15",
};

function state(subscription: Subscription | null, history: Partial<BillingState> = {}): BillingState {
  return { currency: "USD", tier: "managed", upgradePaid: false, subscription, hasEverPaid: false, paymentUnderReview: false, plan: USD, ...history };
}

beforeEach(() => {
  vi.resetAllMocks();
  outcome = null;
  events = [];
  provider = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000" });
  cancelled = vi.spyOn(provider, "cancelSubscription").mockImplementation(async () => {
    events.push("provider:cancel");
  });
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getBillingProvider).mockReturnValue(provider);
  vi.mocked(getStaffDb).mockReturnValue({
    transaction: async (work: (staffTx: ScopedTransaction) => Promise<unknown>) => {
      try {
        const result = await work(tx);
        events.push("commit");
        outcome = "committed";
        return result;
      } catch (error) {
        outcome = "rolled back";
        throw error;
      }
    },
  } as unknown as Database);
  // No affiliate behind these subscriptions: the earning path is proven in packages/shared's integration test.
  vi.mocked(findAffiliateAccrualContext).mockResolvedValue(null);
  vi.mocked(recordPaymentAndActivate).mockResolvedValue({
    payment: { id: "payment-1" } as Payment,
    alreadyRecorded: false,
    leadsMarkedPaid: 1,
  });
  // A client from a setup link: nothing to open.
  vi.mocked(openMembershipForListingBusiness).mockResolvedValue(null);
  vi.mocked(findActivePlan).mockResolvedValue(USD);
  vi.mocked(findBillingState).mockResolvedValue(state(null));
  // No referral code applied, unless a test says otherwise.
  vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
  vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
  // No lapsed subscription to read a basket from, and the package offer still open, unless a test says otherwise.
  vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue(null);
  vi.mocked(isPackageOfferForfeited).mockResolvedValue(false);
  vi.mocked(openCheckoutSubscription).mockImplementation(
    async (_tx, input) => ({ id: "sub-manual", ...input }) as unknown as Subscription,
  );
});

afterEach(() => {
  logged.mockRestore();
});

describe("activateFirstPayment", () => {
  it("records the plan's first payment and opens one month for the USD plan", async () => {
    await activateFirstPayment(tx, {
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      plan: USD,
      provider: "fake",
      providerPaymentId: "fake_pay_1",
      paidAt: NOW,
    });

    const oneMonthOn = new Date("2026-10-16T12:00:00.000Z");
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, {
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      provider: "fake",
      providerPaymentId: "fake_pay_1",
      kind: "initial",
      amountCents: 7500,
      currency: "USD",
      paidAt: NOW,
      paidThroughAt: oneMonthOn,
      commitmentEndsAt: oneMonthOn,
      currentPeriodEnd: oneMonthOn,
    });
  });

  it("opens exactly one month for the INR plan, clamped to the end of a short month", async () => {
    const endOfJanuary = new Date("2027-01-31T09:00:00.000Z");
    await activateFirstPayment(tx, {
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      plan: INR,
      provider: "fake",
      providerPaymentId: "fake_pay_1",
      paidAt: endOfJanuary,
    });

    const endOfFebruary = new Date("2027-02-28T09:00:00.000Z");
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountCents: 350000,
        currency: "INR",
        paidThroughAt: endOfFebruary,
        commitmentEndsAt: endOfFebruary,
      }),
    );
  });
});

describe("recordManualFirstPayment", () => {
  beforeEach(() => {
    vi.mocked(findActivePlan).mockResolvedValue(SERVICES_USD);
    vi.mocked(findBillingState).mockResolvedValue(state(null, { plan: SERVICES_USD }));
    // The website line the manual subscription was opened with, waiting for this payment.
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([{ ...WEBSITE_USD_LINE, status: "pending" } as BundledAddOn]);
  });

  it("opens a manual subscription for the website and activates it with its audit trail", async () => {
    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });

    expect(lockBusinessForBilling).toHaveBeenCalledWith(tx, BUSINESS_ID);
    expect(openCheckoutSubscription).toHaveBeenCalledWith(tx, {
      businessId: BUSINESS_ID,
      planId: USD.id,
      provider: "manual",
      providerSubscriptionId: expect.stringMatching(/^manual_sub_[0-9a-f-]{36}$/),
      referralCodeId: null,
      discountAmountCents: 0,
      bundledAddOns: [WEBSITE_USD_LINE],
      replacing: null,
      now: NOW,
    });
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        subscriptionId: "sub-manual",
        provider: "manual",
        providerPaymentId: expect.stringMatching(/^manual_pay_[0-9a-f-]{36}$/),
        kind: "initial",
        amountCents: 7500,
        paidAt: NOW,
        manual: { recordedByStaffId: "staff-1", reference: "HDFC-UTR-000123", receivedOn: "2026-09-15" },
      }),
    );
    expect(outcome).toBe("committed");
    expect(cancelled).not.toHaveBeenCalled();
  });

  it.each([
    ["a recent one", NOW.getTime() - 60_000],
    ["a stale one", NOW.getTime() - 48 * 60 * 60 * 1000],
  ])(
    "replaces an unpaid checkout the customer left open (%s), and cancels it at the provider after the commit",
    async (_label, createdAt) => {
      const open = {
        id: "sub-open",
        planId: USD.id,
        provider: "fake",
        providerSubscriptionId: `fake_sub_${"c".repeat(24)}`,
        status: "incomplete",
        createdAt: new Date(createdAt),
      } as Subscription;
      vi.mocked(findBillingState).mockResolvedValue(state(open));

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
      expect(openCheckoutSubscription).toHaveBeenCalledWith(tx, expect.objectContaining({ replacing: "sub-open" }));
      expect(cancelled).toHaveBeenCalledWith(`fake_sub_${"c".repeat(24)}`);
      expect(events).toEqual(["commit", "provider:cancel"]);
    },
  );

  describe("an unpaid checkout that holds more than the website", () => {
    const open = {
      id: "sub-open",
      planId: USD.id,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"c".repeat(24)}`,
      status: "incomplete",
      adCreditCents: 0,
      createdAt: new Date(NOW.getTime() - 60_000),
    } as Subscription;
    const SOCIAL_LINE = { addOn: "digital-growth", listAmountCents: 7_500, offerDiscountAmountCents: 1_500, netAmountCents: 6_000, taxRateBasisPoints: 0 };

    it.each([
      ["a second service", [{ ...WEBSITE_USD_LINE, status: "pending" }, { ...SOCIAL_LINE, status: "pending" }], 0],
      ["a service other than the website", [{ ...SOCIAL_LINE, status: "pending" }], 0],
      ["ad credit on the website alone", [{ ...WEBSITE_USD_LINE, status: "pending" }], 2_500],
    ])("is not replaced when it holds %s: nothing is recorded, opened or cancelled", async (_label, lines, adCreditCents) => {
      vi.mocked(findBillingState).mockResolvedValue(state({ ...open, adCreditCents } as Subscription));
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue(lines as BundledAddOn[]);

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "package-open" });

      expect(openCheckoutSubscription).not.toHaveBeenCalled();
      expect(recordPaymentAndActivate).not.toHaveBeenCalled();
      expect(cancelled).not.toHaveBeenCalled();
    });

    it("is replaced as before when it holds the website alone", async () => {
      vi.mocked(findBillingState).mockResolvedValue(state(open));

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
      expect(openCheckoutSubscription).toHaveBeenCalledWith(tx, expect.objectContaining({ replacing: "sub-open", bundledAddOns: [WEBSITE_USD_LINE] }));
    });
  });

  it("keeps the recorded payment and logs when the provider will not cancel the replaced checkout", async () => {
    const open = {
      id: "sub-open",
      planId: USD.id,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"c".repeat(24)}`,
      status: "incomplete",
      createdAt: new Date(NOW.getTime() - 60_000),
    } as Subscription;
    vi.mocked(findBillingState).mockResolvedValue(state(open));
    cancelled.mockRejectedValue(new Error("provider unreachable"));

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
    expect(outcome).toBe("committed");
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[brandbasket:billing\] provider-cancel-failed .*sub-open/);
  });

  it("logs rather than calls a provider that is not the one the replaced checkout was opened at", async () => {
    const open = {
      id: "sub-open",
      planId: USD.id,
      provider: "razorpay",
      providerSubscriptionId: "sub_Razorpay123",
      status: "incomplete",
      createdAt: new Date(NOW.getTime() - 60_000),
    } as Subscription;
    vi.mocked(findBillingState).mockResolvedValue(state(open));

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
    expect(cancelled).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/provider-cancel-failed .*ProviderNotConfigured/);
  });

  it("records over a replaced checkout that was never paid, even while its late payment is under review", async () => {
    const replaced = { id: "sub-old", status: "cancelled", paidThroughAt: null } as Subscription;
    vi.mocked(findBillingState).mockResolvedValue(state(replaced, { paymentUnderReview: true }));

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
    expect(openCheckoutSubscription).toHaveBeenCalledWith(tx, expect.objectContaining({ replacing: null }));
    expect(cancelled).not.toHaveBeenCalled();
  });

  it.each([
    ["an active subscription", "active"],
    ["a subscription cancelled inside its paid period", "cancelled"],
  ] as const)("records nothing for a business with %s", async (_label, status) => {
    const paid = { status, paidThroughAt: new Date(NOW.getTime() + 1000) } as Subscription;
    vi.mocked(findBillingState).mockResolvedValue(state(paid, { hasEverPaid: true }));

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "already-paid" });
    expect(recordPaymentAndActivate).not.toHaveBeenCalled();
  });

  it("reactivates a lapsed business: ends its old plan and records a month at today's monthly price", async () => {
    const lapsed = {
      id: "sub-lapsed",
      planId: "plan-old",
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
      status: "active",
      activatedAt: new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000),
      paidThroughAt: new Date(NOW.getTime() - 1000),
      createdAt: new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000),
    } as Subscription;
    vi.mocked(findBillingState).mockResolvedValue(state(lapsed, { hasEverPaid: true }));

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });

    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ planId: USD.id, provider: "manual", replacing: "sub-lapsed", referralCodeId: null, discountAmountCents: 0 }),
    );
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: "reactivation",
        amountCents: 7500,
        paidAt: NOW,
        paidThroughAt: new Date("2026-10-16T12:00:00.000Z"),
        manual: { recordedByStaffId: "staff-1", reference: "HDFC-UTR-000123", receivedOn: "2026-09-15" },
      }),
    );
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
    expect(events).toEqual(["commit", "provider:cancel"]);
  });

  it("reactivates beside a cancelled plan that ran out, replacing nothing, and takes no coupon", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      state({ id: "sub-ended", status: "cancelled", paidThroughAt: new Date(NOW.getTime() - 1000) } as Subscription, { hasEverPaid: true }),
    );
    vi.mocked(findBusinessReferralCode).mockResolvedValue({ id: "code-1", code: "SAVE5", currency: "USD" } as ReferralCode);

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });

    expect(findBusinessReferralCode).not.toHaveBeenCalled();
    expect(openCheckoutSubscription).toHaveBeenCalledWith(tx, expect.objectContaining({ replacing: null, referralCodeId: null }));
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({ kind: "reactivation" }));
  });

  describe("reactivating the basket the business lapsed with", () => {
    const AGO = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    const usdLine = (addOn: string, listAmountCents: number, offerDiscountAmountCents: number) => ({
      addOn,
      listAmountCents,
      offerDiscountAmountCents,
      netAmountCents: listAmountCents - offerDiscountAmountCents,
      taxRateBasisPoints: 0,
    });
    /**
     * The lapsed subscription and its lines. The double answers every read of a subscription's lines with them, the new
     * subscription's included, so each carries the net the payment will be recorded at.
     */
    const lapse = (overrides: Partial<Subscription>, addOns: readonly (readonly [string, number])[]): void => {
      const lapsed = {
        id: "sub-lapsed",
        planId: "plan-old",
        provider: "fake",
        providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
        status: "active",
        activatedAt: AGO,
        paidThroughAt: new Date(NOW.getTime() - 1000),
        createdAt: AGO,
        cancelRequestedAt: null,
        adCreditCents: 0,
        ...overrides,
      } as Subscription;
      vi.mocked(findActivePlan).mockResolvedValue(SERVICES_USD);
      vi.mocked(findBillingState).mockResolvedValue(state(lapsed, { hasEverPaid: true, plan: SERVICES_USD }));
      vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue(lapsed);
      vi.mocked(findLatestActivatedSubscriptionForBusiness).mockResolvedValue(lapsed.activatedAt === null ? null : lapsed);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue(
        addOns.map(([addOn, netAmountCents]) => ({ addOn, netAmountCents, status: "active", activatedAt: AGO, endRequestedAt: null }) as BundledAddOn),
      );
    };

    it("books every service it had at the package price with its ad credit, not the website alone", async () => {
      lapse({ adCreditCents: 6_000 }, [["managed-website", 5_250], ["digital-growth", 5_250], ["local-seo-aeo", 24_500]]);

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });

      expect(openCheckoutSubscription).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          replacing: "sub-lapsed",
          adCreditCents: 6_000,
          referralCodeId: null,
          bundledAddOns: [usdLine("managed-website", 7_500, 2_250), usdLine("digital-growth", 7_500, 2_250), usdLine("local-seo-aeo", 35_000, 10_500)],
        }),
      );
      expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({ kind: "reactivation", amountCents: 35_000 }));
      expect(markPackageOfferForfeited).not.toHaveBeenCalled();
    });

    it("books a cancelled subscription's services at list with no ad credit, and ends the package offer for good", async () => {
      lapse({ status: "cancelled", cancelRequestedAt: AGO, adCreditCents: 6_000 }, [["managed-website", 7_500], ["digital-growth", 7_500]]);

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });

      expect(openCheckoutSubscription).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ replacing: null, adCreditCents: 0, bundledAddOns: [usdLine("managed-website", 7_500, 0), usdLine("digital-growth", 7_500, 0)] }),
      );
      expect(markPackageOfferForfeited).toHaveBeenCalledWith(tx, BUSINESS_ID, NOW);
    });

    it("is not held back by the unpaid reactivation checkout it replaces, which holds the same basket", async () => {
      lapse({ status: "incomplete", activatedAt: null, paidThroughAt: null, adCreditCents: 2_500 }, []);
      // The package was billed by the subscription before it; its lines ended when the unpaid one replaced it.
      const billed = { id: "sub-billed", activatedAt: AGO, status: "cancelled", cancelRequestedAt: null, adCreditCents: 0 } as Subscription;
      vi.mocked(findLatestActivatedSubscriptionForBusiness).mockResolvedValue(billed);
      vi.mocked(findBundledAddOnsForSubscription).mockImplementation(async (_db, subscriptionId) =>
        ["managed-website", "digital-growth"].map(
          (addOn) =>
            (subscriptionId === billed.id
              ? { addOn, netAmountCents: 6_000, status: "removed", activatedAt: AGO, endRequestedAt: null }
              : { addOn, netAmountCents: 6_000, status: "pending", activatedAt: null, endRequestedAt: null }) as BundledAddOn,
        ),
      );

      await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "recorded" });
      expect(openCheckoutSubscription).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ replacing: "sub-lapsed", adCreditCents: 2_500, bundledAddOns: [usdLine("managed-website", 7_500, 1_500), usdLine("digital-growth", 7_500, 1_500)] }),
      );
    });
  });

  it("gives a free listing account that paid by transfer its Payload tenant, once the payment has committed", async () => {
    vi.mocked(openMembershipForListingBusiness).mockResolvedValue({ businessName: "Smile Dental" });
    vi.mocked(syncTenantForBusiness).mockImplementation(async () => {
      events.push("tenant:sync");
    });
    expect(await recordManualFirstPayment(MANUAL, NOW)).toEqual({ kind: "recorded" });
    expect(syncTenantForBusiness).toHaveBeenCalledWith({ businessId: BUSINESS_ID, name: "Smile Dental" });
    expect(events).toEqual(["commit", "tenant:sync"]);
  });

  it("creates no tenant for a business that was already a client", async () => {
    await recordManualFirstPayment(MANUAL, NOW);
    expect(syncTenantForBusiness).not.toHaveBeenCalled();
  });

  it("records nothing when the currency has no plan", async () => {
    vi.mocked(findActivePlan).mockResolvedValue(null);

    await expect(recordManualFirstPayment(MANUAL, NOW)).resolves.toEqual({ kind: "no-plan" });
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });

  it("fails, writing nothing, for a business that does not exist", async () => {
    vi.mocked(findBillingState).mockResolvedValue(null);

    await expect(recordManualFirstPayment(MANUAL, NOW)).rejects.toThrow();
    expect(outcome).toBe("rolled back");
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });
});

describe("resolveFlaggedPayment", () => {
  it("resolves a payment of the named business on behalf of the admin", async () => {
    vi.mocked(resolvePaymentAttention).mockResolvedValue(true);
    const input = { paymentId: "pay-1", businessId: BUSINESS_ID, staffUserId: "staff-1" };

    await expect(resolveFlaggedPayment(input, NOW)).resolves.toBe(true);
    expect(resolvePaymentAttention).toHaveBeenCalledWith(expect.anything(), { ...input, now: NOW });
  });
});

describe("a manual payment on a business that applied a referral code", () => {
  // 15% of the website's 7,500 cents.
  const CODE = {
    id: "code-1",
    code: "SAVE15",
    currency: "USD",
    affiliateId: null,
    discount: { kind: "amount", amountCents: 1_125 },
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    createdAt: NOW,
  } as ReferralCode;

  beforeEach(() => {
    vi.mocked(findActivePlan).mockResolvedValue(SERVICES_USD);
    vi.mocked(findBillingState).mockResolvedValue(state(null, { plan: SERVICES_USD }));
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([{ ...WEBSITE_USD_LINE, status: "pending" } as BundledAddOn]);
    vi.mocked(findBusinessReferralCode).mockResolvedValue(CODE);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(CODE);
  });

  it("freezes the discount onto the manual subscription, as a checkout would", async () => {
    await recordManualFirstPayment(MANUAL, NOW);
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ referralCodeId: "code-1", discountAmountCents: 1_125 }),
    );
  });

  it("records what the customer was actually asked to transfer, not the plan's list price", async () => {
    await recordManualFirstPayment(MANUAL, NOW);
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ kind: "initial", amountCents: 6_375, currency: "USD" }),
    );
  });

  it("ignores a code that is no longer redeemable, charging the full price", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
    await recordManualFirstPayment(MANUAL, NOW);
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ referralCodeId: null, discountAmountCents: 0 }),
    );
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({ amountCents: 7_500 }));
  });

  it("ignores a code for another currency", async () => {
    vi.mocked(findRedeemableReferralCode).mockResolvedValue({ ...CODE, currency: "INR" } as ReferralCode);
    await recordManualFirstPayment(MANUAL, NOW);
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({ amountCents: 7_500 }));
  });

  it("resolves a percentage code against the website's list price, not the plan's 0, and freezes the money it comes to", async () => {
    const percent = { ...CODE, discount: { kind: "percent", basisPoints: 1_500 } } as ReferralCode;
    vi.mocked(findBusinessReferralCode).mockResolvedValue(percent);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(percent);
    await recordManualFirstPayment(MANUAL, NOW);
    // 15% of 7,500 cents is 1,125.
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ referralCodeId: "code-1", discountAmountCents: 1_125 }),
    );
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({ amountCents: 6_375 }));
  });
});
