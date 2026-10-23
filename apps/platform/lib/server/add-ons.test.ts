import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  consumeRateLimit,
  endPackageOffer,
  findBundledAddOnsForSubscription,
  findBusinessCurrency,
  findLiveBundledAddOns,
  findPlanById,
  findReferralCodeById,
  findSubscriptionById,
  findWaitingSuccessor,
  isPackageOfferForfeited,
  recordBundledAddOnRemoval,
  setNextDiscount,
  withTenantScope,
  type BundledAddOn,
  type Database,
  type ScopedTransaction,
} from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";
import { readAddOnAssessment, startAddOn } from "@brandbasket/shared/server/basket-change";
import { ADD_ON_CHECKOUT_RATE_LIMIT, addBundledAddOnFor, loadAddOnsPage, removeBundledAddOnFor } from "./add-ons";

// Database doubles; the bundled add-on queries are proven in packages/db and the pure prices in packages/shared/lib/billing.
// What is checked here is what the page is shown, the order of the gates, that the provider is only ever called with no
// transaction open, and what each decision and failure turns into. The provider is the real fake one.
vi.mock("server-only", () => ({}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./discount-plans", () => ({ ensureDiscountPlan: vi.fn() }));
// The add path's rules are proven against a database in packages/shared; removal runs the real shared code over these doubles.
vi.mock("@brandbasket/shared/server/basket-change", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/shared/server/basket-change")>()),
  readAddOnAssessment: vi.fn(),
  startAddOn: vi.fn(),
}));
vi.mock("@brandbasket/db", () => {
  return {
    consumeRateLimit: vi.fn(),
    endPackageOffer: vi.fn(),
    findBundledAddOnsForSubscription: vi.fn(),
    findBusinessCurrency: vi.fn(),
    findLiveBundledAddOns: vi.fn().mockResolvedValue([]),
    findPlanById: vi.fn(),
    findReferralCodeById: vi.fn(),
    findSubscriptionById: vi.fn(),
    findWaitingSuccessor: vi.fn(),
    flagSubscriptionForAttention: vi.fn(),
    isPackageOfferForfeited: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    recordBundledAddOnRemoval: vi.fn(),
    setNextDiscount: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const SECRET = "a-test-secret-that-is-long-enough-000";
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-10-20T09:00:00.000Z");
const PAID_AT = new Date("2026-10-12T09:00:00.000Z");
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

const customer: GrantedCustomer = {
  user: { id: "user-a", email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null },
  tenant: { userId: "user-a", businessId: BUSINESS_ID, businessName: "Riverside Dental", role: "owner" },
  billing: { status: "paid", hasAccess: true, hasWebsite: true, subscription: null, tier: "managed", upgradePaid: false, plan: null, paymentUnderReview: false, renewalFailingUntil: null },
};

/** Social Media and Ads and Local SEO + AEO in rupees as frozen on their rows, before GST. */
const DIGITAL_GROWTH_NET = 665_000;

/** The discount frozen on each line of the three-service package: 30% of its list, the dearest line carrying the leftover. */
const PACKAGE_DISCOUNTS: Readonly<Record<string, number>> = { "managed-website": 89_970, "digital-growth": 299_970, "local-seo-aeo": 750_060 };

let provider: BillingProvider;
let staffDb: Database;
let logged: MockInstance<typeof console.error>;
let warned: MockInstance<typeof console.warn>;
/** Everything that happened, in order: transactions opening and closing, and provider calls. */
let events: string[];
let openTransactions: number;
let transactionCount: number;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findLiveBundledAddOns).mockResolvedValue([]);
  vi.mocked(findBusinessCurrency).mockResolvedValue("INR");
  vi.mocked(isPackageOfferForfeited).mockResolvedValue(false);
  vi.mocked(findWaitingSuccessor).mockResolvedValue(null);
  events = [];
  openTransactions = 0;
  transactionCount = 0;
  const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
  provider = {
    ...real,
    changeSubscriptionPlanAtPeriodEnd: async (id, planId) => {
      events.push(openTransactions === 0 ? "provider:change-plan" : "provider:change-plan INSIDE A TRANSACTION");
      return real.changeSubscriptionPlanAtPeriodEnd(id, planId);
    },
  };
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(getBillingProvider).mockReturnValue(provider);
  vi.mocked(getAppDb).mockReturnValue(appDb);
  staffDb = {
    transaction: async (work: (tx: ScopedTransaction) => Promise<unknown>) => {
      transactionCount += 1;
      const name = `tx${transactionCount}`;
      openTransactions += 1;
      events.push(`${name}:begin`);
      try {
        const result = await work({ name } as unknown as ScopedTransaction);
        events.push(`${name}:commit`);
        return result;
      } catch (error) {
        events.push(`${name}:rollback`);
        throw error;
      } finally {
        openTransactions -= 1;
      }
    },
  } as unknown as Database;
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(readAddOnAssessment).mockResolvedValue(null);
});

afterEach(() => {
  logged.mockRestore();
  warned.mockRestore();
});

describe("loadAddOnsPage", () => {
  const PAID_THROUGH = new Date("2026-11-12T09:00:00.000Z");
  const subscribed: GrantedCustomer = { ...customer, billing: { ...customer.billing, subscription: { paidThroughAt: PAID_THROUGH } as never } };
  const includedRow = (overrides: Partial<BundledAddOn> = {}): BundledAddOn =>
    ({
      id: "0192f3c4-5555-7000-8000-000000000001",
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      addOn: "digital-growth",
      status: "active",
      listAmountCents: 700_000,
      offerDiscountAmountCents: 35_000,
      netAmountCents: DIGITAL_GROWTH_NET,
      taxRateBasisPoints: 1_800,
      endRequestedAt: null,
      billedFrom: PAID_AT,
      ...overrides,
    }) as BundledAddOn;

  it("reads through row-level security as the signed-in customer, and never with the staff connection without a code", async () => {
    await loadAddOnsPage(customer, NOW);

    expect(withTenantScope).toHaveBeenCalledWith(appDb, customer.tenant, expect.any(Function));
    expect(findLiveBundledAddOns).toHaveBeenCalledWith(appTx, BUSINESS_ID);
    expect(findBusinessCurrency).toHaveBeenCalledWith(appTx, BUSINESS_ID);
    expect(getStaffDb).not.toHaveBeenCalled();
  });

  it("reads the code on the customer's own subscription as staff, which their connection cannot, and assesses with it", async () => {
    const CODE_ID = "0192f3c4-7777-7000-8000-000000000001";
    const code = { id: CODE_ID, code: "THREE" };
    vi.mocked(findReferralCodeById).mockResolvedValueOnce(code as never);
    const coded: GrantedCustomer = { ...customer, billing: { ...customer.billing, subscription: { paidThroughAt: PAID_THROUGH, referralCodeId: CODE_ID } as never } };

    await loadAddOnsPage(coded, NOW);

    expect(findReferralCodeById).toHaveBeenCalledWith(staffDb, CODE_ID);
    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, expect.objectContaining({ addOn: "digital-growth", code }));
  });

  it("offers all three services at list price plus GST when none is in the plan payment, the website included", async () => {
    const page = await loadAddOnsPage(customer, NOW);

    expect(page.currency).toBe("INR");
    expect(page.addOns).toEqual([
      { kind: "available", addOn: "managed-website", price: expect.objectContaining({ listCents: 299_900, discountCents: 0, netCents: 299_900, chargedCents: 353_882 }), offer: { kind: "write" } },
      { kind: "available", addOn: "digital-growth", price: expect.objectContaining({ listCents: 999_900, discountCents: 0, netCents: 999_900, chargedCents: 1_179_882 }), offer: { kind: "write" } },
      { kind: "available", addOn: "local-seo-aeo", price: expect.objectContaining({ listCents: 2_499_900, discountCents: 0, netCents: 2_499_900, chargedCents: 2_949_882 }), offer: { kind: "write" } },
    ]);
  });

  it("shows a service not yet added at the package price it would have, and at list once the offer is given up", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 0, netAmountCents: 299_900 })]);

    const page = await loadAddOnsPage(subscribed, NOW);
    expect(page.addOns.find((entry) => entry.addOn === "digital-growth")).toMatchObject({
      kind: "available",
      price: { listCents: 999_900, discountCents: 200_020, netCents: 799_880, chargedCents: 943_858 },
    });

    vi.mocked(isPackageOfferForfeited).mockResolvedValue(true);
    const forfeited = await loadAddOnsPage(subscribed, NOW);
    expect(forfeited.addOns.find((entry) => entry.addOn === "digital-growth")).toMatchObject({ price: { discountCents: 0, netCents: 999_900 } });
  });

  it("prices a business billed in dollars in dollars, with no tax", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue("USD");

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.currency).toBe("USD");
    expect(page.addOns.map((entry) => entry.price)).toEqual([
      expect.objectContaining({ currency: "USD", listCents: 7_500, taxRateBasisPoints: 0, chargedCents: 7_500 }),
      expect.objectContaining({ currency: "USD", listCents: 7_500, taxRateBasisPoints: 0, chargedCents: 7_500 }),
      expect.objectContaining({ currency: "USD", listCents: 35_000, taxRateBasisPoints: 0, chargedCents: 35_000 }),
    ]);
  });

  it("shows an add-on taken with the plan at the price frozen on it, with the next billing date and no end", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow()]);

    const page = await loadAddOnsPage(subscribed, NOW);

    expect(page.addOns[1]).toEqual({
      kind: "included",
      addOn: "digital-growth",
      price: { currency: "INR", listCents: 700_000, discountCents: 35_000, offerCents: 35_000, netCents: DIGITAL_GROWTH_NET, taxRateBasisPoints: 1_800, chargedCents: 784_700 },
      endsOn: null,
      nextBillingOn: PAID_THROUGH,
      joinsOn: null,
      keepable: false,
      drop: null,
    });
    expect(page.addOns[2]).toMatchObject({ kind: "available", addOn: "local-seo-aeo" });
  });

  describe("what dropping a service leaves", () => {
    const line = (addOn: string, listAmountCents: number, overrides: Partial<BundledAddOn> = {}) =>
      includedRow({ addOn, listAmountCents, offerDiscountAmountCents: PACKAGE_DISCOUNTS[addOn] ?? 0, netAmountCents: listAmountCents - (PACKAGE_DISCOUNTS[addOn] ?? 0), ...overrides });
    const all = () => [line("managed-website", 299_900), line("digital-growth", 999_900), line("local-seo-aeo", 2_499_900)];

    it("shows, for each of three services, the others at list: dropping Local SEO + AEO leaves ₹15,337.64 a month with GST and ends the package", async () => {
      vi.mocked(findLiveBundledAddOns).mockResolvedValue(all());

      const { addOns } = await loadAddOnsPage(subscribed, NOW);

      expect(addOns.map((entry) => (entry.kind === "included" ? [entry.addOn, entry.drop?.keeps, entry.drop?.newMonthlyCents, entry.drop?.endsPackage] : null))).toEqual([
        ["managed-website", ["digital-growth", "local-seo-aeo"], 4_129_764, true],
        ["digital-growth", ["managed-website", "local-seo-aeo"], 3_303_764, true],
        ["local-seo-aeo", ["managed-website", "digital-growth"], 1_533_764, true],
      ]);
    });

    it("says nothing is lost once the offer is already given up", async () => {
      vi.mocked(isPackageOfferForfeited).mockResolvedValue(true);
      vi.mocked(findLiveBundledAddOns).mockResolvedValue(all());

      const { addOns } = await loadAddOnsPage(subscribed, NOW);

      expect(addOns[2]).toMatchObject({ drop: { newMonthlyCents: 1_533_764, endsPackage: false } });
    });

    it("offers no drop while the account has asked to close", async () => {
      vi.mocked(findLiveBundledAddOns).mockResolvedValue(all());
      const closing: GrantedCustomer = { ...subscribed, billing: { ...subscribed.billing, subscription: { paidThroughAt: PAID_THROUGH, cancelRequestedAt: NOW } as never } };

      const { addOns } = await loadAddOnsPage(closing, NOW);

      expect(addOns.map((entry) => (entry.kind === "included" ? entry.drop : "available"))).toEqual([null, null, null]);
    });

    it("offers no drop, and no add, while the client's kept plan waits to start, and says when it starts", async () => {
      vi.mocked(findLiveBundledAddOns).mockResolvedValue([line("managed-website", 299_900), line("digital-growth", 999_900)]);
      vi.mocked(findWaitingSuccessor).mockResolvedValue({ startAt: PAID_THROUGH } as never);
      vi.mocked(readAddOnAssessment).mockImplementation(async (_tx, input) =>
        input.addOn === "local-seo-aeo" ? { kind: "plan-kept", startsOn: PAID_THROUGH } : null,
      );

      const { addOns } = await loadAddOnsPage(subscribed, NOW);

      expect(addOns.map((entry) => (entry.kind === "included" ? entry.drop : "available"))).toEqual([null, null, "available"]);
      expect(addOns[2]).toMatchObject({ kind: "available", offer: { kind: "plan-kept", startsOn: PAID_THROUGH } });
    });

    it("offers no drop for the only service, or for one that is already ending", async () => {
      vi.mocked(findLiveBundledAddOns).mockResolvedValue([line("digital-growth", 999_900)]);
      expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "included", drop: null });

      vi.mocked(findLiveBundledAddOns).mockResolvedValue([line("managed-website", 299_900), line("digital-growth", 999_900, { endRequestedAt: PAID_AT })]);
      const { addOns } = await loadAddOnsPage(subscribed, NOW);
      expect(addOns[1]).toMatchObject({ kind: "included", drop: null });
      // The one still staying is now the only service.
      expect(addOns[0]).toMatchObject({ kind: "included", drop: null });
    });
  });

  it("asks for each add-on's assessment through row-level security, at the time given", async () => {
    await loadAddOnsPage(customer, NOW);

    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, { businessId: BUSINESS_ID, addOn: "managed-website", providerName: "fake", now: NOW, forfeited: false, code: null });
    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, { businessId: BUSINESS_ID, addOn: "digital-growth", providerName: "fake", now: NOW, forfeited: false, code: null });
    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, { businessId: BUSINESS_ID, addOn: "local-seo-aeo", providerName: "fake", now: NOW, forfeited: false, code: null });
  });

  it("offers the add with its charge for the rest of the month and the new monthly payment", async () => {
    vi.mocked(readAddOnAssessment).mockResolvedValue({
      kind: "offer",
      quote: { kind: "quote", netCents: 316_129, chargeCents: 373_032, free: false, nextRenewalCents: 1_179_882, periodEnd: PAID_THROUGH, daysLeft: 14, periodDays: 31 },
    } as never);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({
      kind: "available",
      offer: { kind: "quote", chargeCents: 373_032, daysLeft: 14, nextRenewalCents: 1_179_882, renewsOn: PAID_THROUGH },
    });
  });

  it.each([
    [{ kind: "blocked", reason: "manual-billing" }, { kind: "manual" }],
    [{ kind: "unavailable", reason: "renewal-due" }, { kind: "renewal-due", renewsOn: PAID_THROUGH }],
    [{ kind: "blocked", reason: "under-review" }, { kind: "write" }],
    [{ kind: "unavailable", reason: "provider-not-ready" }, { kind: "write" }],
  ])("turns the assessment %o into the offer %o", async (assessment, offer) => {
    vi.mocked(readAddOnAssessment).mockResolvedValue(assessment as never);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "available", offer });
  });

  it("says when an add-on added this month joins the monthly payment", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ offerDiscountAmountCents: 0, netAmountCents: 700_000, billedFrom: null })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "included", joinsOn: PAID_THROUGH, endsOn: null });
  });

  it("lets an ending add-on be kept when the assessment says so", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ endRequestedAt: PAID_AT })]);
    vi.mocked(readAddOnAssessment).mockResolvedValue({ kind: "keep", row: includedRow() } as never);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "included", endsOn: PAID_THROUGH, keepable: true });
  });

  it("says an included add-on asked to be removed ends on the next billing date", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ endRequestedAt: PAID_AT })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "included", endsOn: PAID_THROUGH, nextBillingOn: PAID_THROUGH });
  });

  it.each(["pending", "removed"] as const)("shows an add-on whose bundled row is %s as available, not included", async (status) => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ status })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[1]).toMatchObject({ kind: "available", addOn: "digital-growth" });
  });

  it("refuses to price the page for a business that does not exist", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue(null);

    await expect(loadAddOnsPage(customer, NOW)).rejects.toThrow(`No business with id ${BUSINESS_ID}`);
  });
});

describe("removeBundledAddOnFor", () => {
  const PAID_THROUGH = new Date("2026-11-09T09:00:00.000Z");
  const PROVIDER_SUBSCRIPTION = `fake_sub_${"a".repeat(24)}`;
  const PLAN = { id: "plan-managed", code: "managed-inr-2026-10", currency: "INR", providerPlanId: "plan_managed_rzp" };
  const IDS = { "managed-website": "000000000001", "digital-growth": "000000000002", "local-seo-aeo": "000000000003" } as const;
  const LISTS = { "managed-website": 299_900, "digital-growth": 999_900, "local-seo-aeo": 2_499_900 } as const;
  /** A line of the three-service package as frozen on it: 30% off every line, and the dearest carries the 90 paise that round the total down to a whole rupee. */
  const bundledRow = (addOn: keyof typeof IDS, overrides: Record<string, unknown> = {}) => ({
    id: `0192f3c4-5555-7000-8000-${IDS[addOn]}`,
    businessId: BUSINESS_ID,
    subscriptionId: "sub-1",
    addOn,
    status: "active",
    listAmountCents: LISTS[addOn],
    offerDiscountAmountCents: PACKAGE_DISCOUNTS[addOn],
    pendingOfferDiscountAmountCents: null,
    netAmountCents: LISTS[addOn] - PACKAGE_DISCOUNTS[addOn],
    endRequestedAt: null,
    ...overrides,
  });
  const subscription = (overrides: Record<string, unknown> = {}) => ({
    id: "sub-1",
    businessId: BUSINESS_ID,
    planId: PLAN.id,
    provider: "fake",
    providerSubscriptionId: PROVIDER_SUBSCRIPTION,
    status: "active",
    activatedAt: PAID_AT,
    paidThroughAt: PAID_THROUGH,
    cancelRequestedAt: null,
    referralCodeId: null,
    discountAmountCents: 0,
    discountMonthsLeft: null,
    nextDiscountAmountCents: null,
    ...overrides,
  });
  let changed: MockInstance<BillingProvider["changeSubscriptionPlanAtPeriodEnd"]>;

  beforeEach(() => {
    changed = vi.spyOn(provider, "changeSubscriptionPlanAtPeriodEnd");
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription() as never);
    // The record transaction reads the subscription's lines again under the lock: the same lines the test gave.
    vi.mocked(findBundledAddOnsForSubscription).mockImplementation((db) => findLiveBundledAddOns(db, BUSINESS_ID));
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(recordBundledAddOnRemoval).mockResolvedValue(true);
    vi.mocked(ensureDiscountPlan).mockResolvedValue("plan_lower");
  });

  it("moves the provider to a plan at the other services' list prices, then records the request and the end of the offer, and says when it stops", async () => {
    const seo = bundledRow("local-seo-aeo");
    const website = bundledRow("managed-website");
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([website, bundledRow("digital-growth"), seo] as never);

    const result = await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(result).toEqual({
      kind: "scheduled",
      endsOn: PAID_THROUGH,
      message: "Social Media and Ads stays until your next payment date, then it stops.",
    });
    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 0, 2_799_800);
    expect(changed).toHaveBeenCalledWith(PROVIDER_SUBSCRIPTION, "plan_lower");
    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), {
      id: bundledRow("digital-growth").id,
      businessId: BUSINESS_ID,
      pendingBundledAddOnNetCents: 2_799_800,
      now: NOW,
    });
    expect(endPackageOffer).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      lines: [
        { id: website.id, pendingOfferDiscountAmountCents: 0 },
        { id: seo.id, pendingOfferDiscountAmountCents: 0 },
      ],
      now: NOW,
    });
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:change-plan", "tx2:begin", "tx2:commit"]);
  });

  it("refuses while a kept plan waits to start: the provider is not asked and nothing is recorded", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("managed-website"), bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);
    vi.mocked(findWaitingSuccessor).mockResolvedValue({ startAt: new Date("2026-11-19T00:00:00.000Z") } as never);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toEqual({
      kind: "refused",
      message: "Your plan starts again on 19 November 2026. You can change your services from then.",
    });

    expect(findWaitingSuccessor).toHaveBeenCalledWith(expect.anything(), "sub-1");
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("keeps an amount code through a drop: the provider is told the new net less the same amount, and it is recorded as unchanged", async () => {
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription({ referralCodeId: "code-1", discountAmountCents: 50_000, discountMonthsLeft: 4 }) as never);
    vi.mocked(findReferralCodeById).mockResolvedValue({ discount: { kind: "amount", amountCents: 50_000 } } as never);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("managed-website"), bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 50_000, 2_799_800);
    expect(setNextDiscount).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub-1", discountCents: 50_000, now: NOW });
  });

  it("reprices a percentage code on what is left after a drop, and records it for the next renewal", async () => {
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription({ referralCodeId: "code-1", discountAmountCents: 1_039_800, discountMonthsLeft: null }) as never);
    vi.mocked(findReferralCodeById).mockResolvedValue({ discount: { kind: "percent", basisPoints: 1_000 } } as never);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("managed-website"), bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    // 10% of the 27,998 (website and SEO at list) that stays.
    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 279_980, 2_799_800);
    expect(setNextDiscount).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub-1", discountCents: 279_980, now: NOW });
  });

  it("takes nothing off once the code's months have run out", async () => {
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription({ referralCodeId: "code-1", discountAmountCents: 50_000, discountMonthsLeft: 0, nextDiscountAmountCents: 0 }) as never);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("managed-website"), bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 0, 2_799_800);
    expect(setNextDiscount).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub-1", discountCents: 0, now: NOW });
  });

  it("moves nothing for a service that is already at list with no change waiting", async () => {
    const website = bundledRow("managed-website", { offerDiscountAmountCents: 0, netAmountCents: 299_900 });
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([website, bundledRow("digital-growth", { offerDiscountAmountCents: 0, netAmountCents: 999_900 })] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(endPackageOffer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lines: [] }));
  });

  it("does not count a service that is already on its way out among those that stay", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([
      bundledRow("managed-website"),
      bundledRow("digital-growth"),
      bundledRow("local-seo-aeo", { endRequestedAt: new Date("2026-10-15T09:00:00.000Z") }),
    ] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingBundledAddOnNetCents: 299_900 }));
  });

  it("refuses to remove the only service and sends the customer to delete the account, touching nothing", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth", { offerDiscountAmountCents: 0, netAmountCents: 999_900 })] as never);

    const result = await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(result).toEqual({
      kind: "refused",
      message: "That is your only service, so it can't be removed on its own. To stop paying, delete your account from Settings.",
    });
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
    expect(endPackageOffer).not.toHaveBeenCalled();
  });

  it("refuses while the account has asked to close, saying so and touching nothing", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription({ cancelRequestedAt: NOW }) as never);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toEqual({
      kind: "refused",
      message: "Your account is set to close, so a service can't be removed on its own.",
    });
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
    expect(endPackageOffer).not.toHaveBeenCalled();
  });

  it("refuses an add-on that is not part of the plan payment, or is already going, touching nothing", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("local-seo-aeo", { endRequestedAt: NOW })] as never);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(await removeBundledAddOnFor(customer, "local-seo-aeo", NOW)).toMatchObject({ kind: "refused" });
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("changes nothing when the provider refuses", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);
    changed.mockRejectedValue(new Error("provider unreachable"));

    const result = await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(result).toMatchObject({ kind: "refused" });
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
    expect(endPackageOffer).not.toHaveBeenCalled();
  });

  it("says so when it was already asked about by the time it is recorded, and ends no offer", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth"), bundledRow("local-seo-aeo")] as never);
    vi.mocked(recordBundledAddOnRemoval).mockResolvedValue(false);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(endPackageOffer).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `add-on-checkout:business:${BUSINESS_ID}`, ADD_ON_CHECKOUT_RATE_LIMIT);
    expect(findLiveBundledAddOns).not.toHaveBeenCalled();
  });
});

describe("addBundledAddOnFor", () => {
  it("sends the customer to pay the charge for the rest of the month", async () => {
    vi.mocked(startAddOn).mockResolvedValue({ kind: "pay", chargeId: "charge-1" });

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toEqual({ kind: "pay", chargeId: "charge-1" });
    expect(startAddOn).toHaveBeenCalledWith(expect.objectContaining({ staffDb, provider }), { businessId: BUSINESS_ID, addOn: "digital-growth", staffId: null, now: NOW });
  });

  it.each([{ kind: "kept" }, { kind: "added", move: { kind: "scheduled" } }] as const)("redraws the page once it is on (%o)", async (started) => {
    vi.mocked(startAddOn).mockResolvedValue(started);

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toEqual({ kind: "done" });
  });

  it.each([{ kind: "changed" }, { kind: "refused", assessment: { kind: "blocked", reason: "ending" } }] as const)("says to reload when it cannot be added (%o)", async (started) => {
    vi.mocked(startAddOn).mockResolvedValue(started);

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused", message: expect.stringContaining("Reload the page") });
  });

  it("says when the plan starts again while a kept plan waits", async () => {
    vi.mocked(startAddOn).mockResolvedValue({ kind: "refused", assessment: { kind: "plan-kept", startsOn: new Date("2026-11-19T00:00:00.000Z") } });

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toEqual({
      kind: "refused",
      message: "Your plan starts again on 19 November 2026. You can change your services from then.",
    });
  });

  it("stops at the rate limit, before anything is opened", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `add-on-checkout:business:${BUSINESS_ID}`, ADD_ON_CHECKOUT_RATE_LIMIT);
    expect(startAddOn).not.toHaveBeenCalled();
  });
});
