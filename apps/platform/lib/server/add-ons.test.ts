import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  consumeRateLimit,
  findBusinessCurrency,
  findLiveBundledAddOns,
  findPlanById,
  findSubscriptionById,
  recordBundledAddOnRemoval,
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
    bundledNetAfterRemoving: (rows: readonly { id: string; status: string; endRequestedAt: Date | null; netAmountCents: number }[], removing: { id: string }) =>
      rows.filter((row) => row.id !== removing.id && row.status === "active" && row.endRequestedAt === null).reduce((total, row) => total + row.netAmountCents, 0),
    consumeRateLimit: vi.fn(),
    findBusinessCurrency: vi.fn(),
    findLiveBundledAddOns: vi.fn().mockResolvedValue([]),
    findPlanById: vi.fn(),
    findSubscriptionById: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    recordBundledAddOnRemoval: vi.fn(),
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
  billing: { status: "paid", hasAccess: true, subscription: null, tier: "managed", upgradePaid: false, plan: null, paymentUnderReview: false, renewalFailingUntil: null },
};

/** Social Media and Ads and Local SEO + AEO in rupees as frozen on their rows, before GST. */
const DIGITAL_GROWTH_NET = 665_000;
const LOCAL_SEO_AEO_NET = 2_375_000;

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

  it("reads through row-level security as the signed-in customer, and never with the staff connection", async () => {
    await loadAddOnsPage(customer, NOW);

    expect(withTenantScope).toHaveBeenCalledWith(appDb, customer.tenant, expect.any(Function));
    expect(findLiveBundledAddOns).toHaveBeenCalledWith(appTx, BUSINESS_ID);
    expect(findBusinessCurrency).toHaveBeenCalledWith(appTx, BUSINESS_ID);
    expect(getStaffDb).not.toHaveBeenCalled();
  });

  it("offers both add-ons at today's list price plus GST when none is in the plan payment", async () => {
    const page = await loadAddOnsPage(customer, NOW);

    expect(page.currency).toBe("INR");
    expect(page.addOns).toEqual([
      { kind: "available", addOn: "digital-growth", price: expect.objectContaining({ listCents: 1_000_000, discountCents: 0, netCents: 1_000_000, chargedCents: 1_180_000 }), offer: { kind: "write" } },
      { kind: "available", addOn: "local-seo-aeo", price: expect.objectContaining({ listCents: 2_500_000, discountCents: 0, netCents: 2_500_000, chargedCents: 2_950_000 }), offer: { kind: "write" } },
    ]);
  });

  it("prices a business billed in dollars in dollars, with no tax", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue("USD");

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.currency).toBe("USD");
    expect(page.addOns.map((entry) => entry.price)).toEqual([
      expect.objectContaining({ currency: "USD", listCents: 7_500, taxRateBasisPoints: 0, chargedCents: 7_500 }),
      expect.objectContaining({ currency: "USD", listCents: 35_000, taxRateBasisPoints: 0, chargedCents: 35_000 }),
    ]);
  });

  it("shows an add-on taken with the plan at the price frozen on it, with the next billing date and no end", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow()]);

    const page = await loadAddOnsPage(subscribed, NOW);

    expect(page.addOns[0]).toEqual({
      kind: "included",
      addOn: "digital-growth",
      price: { currency: "INR", listCents: 700_000, discountCents: 35_000, offerCents: 35_000, netCents: DIGITAL_GROWTH_NET, taxRateBasisPoints: 1_800, chargedCents: 784_700 },
      endsOn: null,
      nextBillingOn: PAID_THROUGH,
      joinsOn: null,
      keepable: false,
    });
    expect(page.addOns[1]).toMatchObject({ kind: "available", addOn: "local-seo-aeo" });
  });

  it("asks for each add-on's assessment through row-level security, at the time given", async () => {
    await loadAddOnsPage(customer, NOW);

    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, { businessId: BUSINESS_ID, addOn: "digital-growth", providerName: "fake", now: NOW });
    expect(readAddOnAssessment).toHaveBeenCalledWith(appTx, { businessId: BUSINESS_ID, addOn: "local-seo-aeo", providerName: "fake", now: NOW });
  });

  it("offers the add with its charge for the rest of the month and the new monthly payment", async () => {
    vi.mocked(readAddOnAssessment).mockResolvedValue({
      kind: "offer",
      quote: { kind: "quote", netCents: 316_129, chargeCents: 373_032, free: false, nextRenewalCents: 1_179_882, periodEnd: PAID_THROUGH, daysLeft: 14, periodDays: 31 },
    } as never);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({
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

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({ kind: "available", offer });
  });

  it("says when an add-on added this month joins the monthly payment", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ offerDiscountAmountCents: 0, netAmountCents: 700_000, billedFrom: null })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({ kind: "included", joinsOn: PAID_THROUGH, endsOn: null });
  });

  it("lets an ending add-on be kept when the assessment says so", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ endRequestedAt: PAID_AT })]);
    vi.mocked(readAddOnAssessment).mockResolvedValue({ kind: "keep", row: includedRow() } as never);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({ kind: "included", endsOn: PAID_THROUGH, keepable: true });
  });

  it("says an included add-on asked to be removed ends on the next billing date", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ endRequestedAt: PAID_AT })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({ kind: "included", endsOn: PAID_THROUGH, nextBillingOn: PAID_THROUGH });
  });

  it.each(["pending", "removed"] as const)("shows an add-on whose bundled row is %s as available, not included", async (status) => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([includedRow({ status })]);

    expect((await loadAddOnsPage(subscribed, NOW)).addOns[0]).toMatchObject({ kind: "available", addOn: "digital-growth" });
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
  const bundledRow = (addOn: string, netAmountCents: number, overrides: Record<string, unknown> = {}) => ({
    id: `0192f3c4-5555-7000-8000-${addOn === "digital-growth" ? "000000000001" : "000000000002"}`,
    businessId: BUSINESS_ID,
    subscriptionId: "sub-1",
    addOn,
    status: "active",
    netAmountCents,
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
    discountAmountCents: 0,
    ...overrides,
  });
  let changed: MockInstance<BillingProvider["changeSubscriptionPlanAtPeriodEnd"]>;

  beforeEach(() => {
    changed = vi.spyOn(provider, "changeSubscriptionPlanAtPeriodEnd");
    vi.mocked(findSubscriptionById).mockResolvedValue(subscription() as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(recordBundledAddOnRemoval).mockResolvedValue(true);
    vi.mocked(ensureDiscountPlan).mockResolvedValue("plan_lower");
  });

  it("moves the provider to a plan at what is left, then records the request, and says when it stops", async () => {
    const digitalGrowth = bundledRow("digital-growth", DIGITAL_GROWTH_NET);
    const localSeo = bundledRow("local-seo-aeo", LOCAL_SEO_AEO_NET);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([digitalGrowth, localSeo] as never);

    const result = await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(result).toEqual({
      kind: "scheduled",
      endsOn: PAID_THROUGH,
      message: "Social Media and Ads stays until your next payment date, then it stops and your monthly payment goes down.",
    });
    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 0, LOCAL_SEO_AEO_NET);
    expect(changed).toHaveBeenCalledWith(PROVIDER_SUBSCRIPTION, "plan_lower");
    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), { id: digitalGrowth.id, businessId: BUSINESS_ID, pendingBundledAddOnNetCents: LOCAL_SEO_AEO_NET, now: NOW });
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:change-plan", "tx2:begin", "tx2:commit"]);
  });

  it("moves back to the plan's own provider plan when nothing is left to add", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth", DIGITAL_GROWTH_NET)] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(ensureDiscountPlan).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith(PROVIDER_SUBSCRIPTION, "plan_managed_rzp");
    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingBundledAddOnNetCents: 0 }));
  });

  it("does not count an add-on that is already on its way out toward what is left", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([
      bundledRow("digital-growth", DIGITAL_GROWTH_NET),
      bundledRow("local-seo-aeo", LOCAL_SEO_AEO_NET, { endRequestedAt: new Date("2026-10-15T09:00:00.000Z") }),
    ] as never);

    await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingBundledAddOnNetCents: 0 }));
  });

  it("refuses an add-on that is not part of the plan payment, or is already going, touching nothing", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("local-seo-aeo", LOCAL_SEO_AEO_NET, { endRequestedAt: NOW })] as never);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(await removeBundledAddOnFor(customer, "local-seo-aeo", NOW)).toMatchObject({ kind: "refused" });
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("changes nothing when the provider refuses", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth", DIGITAL_GROWTH_NET), bundledRow("local-seo-aeo", LOCAL_SEO_AEO_NET)] as never);
    changed.mockRejectedValue(new Error("provider unreachable"));

    const result = await removeBundledAddOnFor(customer, "digital-growth", NOW);

    expect(result).toMatchObject({ kind: "refused" });
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("says so when it was already asked about by the time it is recorded", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("digital-growth", DIGITAL_GROWTH_NET)] as never);
    vi.mocked(recordBundledAddOnRemoval).mockResolvedValue(false);

    expect(await removeBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
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

  it("stops at the rate limit, before anything is opened", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    expect(await addBundledAddOnFor(customer, "digital-growth", NOW)).toMatchObject({ kind: "refused" });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `add-on-checkout:business:${BUSINESS_ID}`, ADD_ON_CHECKOUT_RATE_LIMIT);
    expect(startAddOn).not.toHaveBeenCalled();
  });
});
