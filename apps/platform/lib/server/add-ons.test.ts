import { addMonthsUtc, createFakeBillingProvider, FAKE_ADD_ON_CONFIRM_PATH, FAKE_PAYMENT_METHOD, type BillingProvider } from "@fynix/billing";
import {
  cancelStaleAddOnCheckout,
  changeAddOnEndKind,
  consumeRateLimit,
  findAddOnSubscription,
  findBillingState,
  findBusinessCurrency,
  findLifetimeOfferStanding,
  findLiveBundledAddOns,
  findPlanById,
  findSubscriptionById,
  insertAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  listPressReleasesForBusiness,
  lockBusinessForBilling,
  markAddOnCancelled,
  recordBundledAddOnRemoval,
  recordUnappliedAddOnPayment,
  scheduleAddOnEnd,
  updateAddOnStatus,
  withTenantScope,
  type AddOnSubscription,
  type Database,
  type ScopedTransaction,
} from "@fynix/db";
import { applyAddOnPayment } from "@fynix/shared/server/add-on-activation";
import { ensureAddOnPlan } from "@fynix/shared/server/add-on-plans";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getCustomerBusinessKind } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";
import {
  ADD_ON_CHECKOUT_RATE_LIMIT,
  confirmFakeAddOnPaymentFor,
  loadAddOnsPage,
  removeBundledAddOnFor,
  scheduleAddOnEndFor,
  startAddOnCheckoutFor,
  UnsafeAddOnCheckoutUrlError,
  verifyAddOnPaymentFor,
} from "./add-ons";

// Database doubles; the one-billing and one-checkout rules and the payment recording are proven in packages/db, the
// activation in packages/shared, and the pure rules in packages/shared/lib/billing. What is checked here is the order of
// the gates, that the provider is only ever called with no transaction open, and what each decision and failure turns
// into. The provider is the real fake one.
vi.mock("server-only", () => ({}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("./customer-access", () => ({ getCustomerBusinessKind: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@fynix/shared/server/add-on-plans", () => ({ ensureAddOnPlan: vi.fn() }));
vi.mock("@fynix/shared/server/add-on-activation", () => ({ applyAddOnPayment: vi.fn() }));
vi.mock("./discount-plans", () => ({ ensureDiscountPlan: vi.fn() }));
vi.mock("@fynix/db", () => {
  return {
    bundledNetAfterRemoving: (rows: readonly { id: string; status: string; endRequestedAt: Date | null; netAmountCents: number }[], removing: { id: string }) =>
      rows.filter((row) => row.id !== removing.id && row.status === "active" && row.endRequestedAt === null).reduce((total, row) => total + row.netAmountCents, 0),
    cancelStaleAddOnCheckout: vi.fn(),
    changeAddOnEndKind: vi.fn(),
    consumeRateLimit: vi.fn(),
    findAddOnSubscription: vi.fn(),
    findBillingState: vi.fn(),
    findBusinessCurrency: vi.fn(),
    findLifetimeOfferStanding: vi.fn(),
    findLiveBundledAddOns: vi.fn().mockResolvedValue([]),
    findPlanById: vi.fn(),
    findSubscriptionById: vi.fn(),
    findOpenChargeOfKind: vi.fn(),
    insertAddOnSubscription: vi.fn(),
    insertCharge: vi.fn(),
    listAddOnSubscriptionsForBusiness: vi.fn(),
    listPressReleasesForBusiness: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    markAddOnCancelled: vi.fn(),
    recordBundledAddOnRemoval: vi.fn(),
    recordUnappliedAddOnPayment: vi.fn(),
    scheduleAddOnEnd: vi.fn(),
    updateAddOnStatus: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const SECRET = "a-test-secret-that-is-long-enough-000";
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-10-20T09:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PAID_AT = new Date("2026-10-12T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

const customer: GrantedCustomer = {
  user: { id: "user-a", email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null },
  tenant: { userId: "user-a", businessId: BUSINESS_ID, businessName: "Riverside Dental", role: "owner" },
  billing: { status: "paid", hasAccess: true, subscription: null, tier: "care", upgradePaid: false, plan: null, paymentUnderReview: false, renewalFailingUntil: null },
};
const premiumCustomer: GrantedCustomer = { ...customer, billing: { ...customer.billing, tier: "premium" } };

let provider: BillingProvider;
let staffDb: Database;
let cancelled: MockInstance<BillingProvider["cancelSubscription"]>;
let endedAtPeriodEnd: MockInstance<BillingProvider["cancelSubscriptionAtPeriodEnd"]>;
let started: MockInstance<BillingProvider["startAddOnSubscription"]>;
let logged: MockInstance<typeof console.error>;
let warned: MockInstance<typeof console.warn>;
/** Everything that happened, in order: transactions opening and closing, and provider calls. */
let events: string[];
let openTransactions: number;
let transactionCount: number;

let nextRow = 0;

/** A Social media row at the list price, active and paid for the month to PERIOD_END, unless a test says otherwise. */
function addOnRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  nextRow += 1;
  const hex = nextRow.toString(16).padStart(24, "0");
  return {
    id: `0192f3c4-2222-7000-8000-${nextRow.toString(16).padStart(12, "0")}`,
    businessId: BUSINESS_ID,
    addOn: "social-media",
    listAmountCents: 199_900,
    discountAmountCents: 0,
    offerDiscountAmountCents: 0,
    netAmountCents: 199_900,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: 235_882,
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${hex}`,
    providerPlanId: null,
    providerStatus: null,
    status: "active",
    startAt: null,
    activatedAt: PAID_AT,
    currentPeriodStart: PAID_AT,
    currentPeriodEnd: PERIOD_END,
    haltedAt: null,
    endKind: null,
    endRequestedAt: null,
    endRequestedByStaffId: null,
    endedAt: null,
    continuesId: null,
    contactedAt: null,
    contactedByStaffId: null,
    createdAt: PAID_AT,
    updatedAt: PAID_AT,
    ...overrides,
  };
}

/** Paused: cancelled with a pause that came due a week ago, bought at a price that is not today's. */
function pausedRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  return addOnRow({
    status: "cancelled",
    endKind: "pause",
    endRequestedAt: new Date("2026-10-01T09:00:00.000Z"),
    currentPeriodEnd: new Date(NOW.getTime() - 7 * DAY_MS),
    endedAt: new Date(NOW.getTime() - 7 * DAY_MS),
    listAmountCents: 599_900,
    netAmountCents: 599_900,
    chargedAmountCents: 707_882,
    contactedAt: new Date("2026-09-15T09:00:00.000Z"),
    contactedByStaffId: "staff-1",
    ...overrides,
  });
}

/** A renewal Razorpay gave up on, `daysAgo` days ago. */
function haltedRow(daysAgo: number, overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  return addOnRow({
    status: "halted",
    haltedAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    contactedAt: new Date("2026-09-15T09:00:00.000Z"),
    contactedByStaffId: "staff-1",
    ...overrides,
  });
}

function checkoutRow(overrides: Partial<AddOnSubscription> = {}): AddOnSubscription {
  return addOnRow({
    status: "incomplete",
    activatedAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    createdAt: new Date(NOW.getTime() - HOUR_MS),
    ...overrides,
  });
}

/** The rows the business has, newest first, as seen by every transaction unless a test says otherwise. */
function rowsAre(...rows: AddOnSubscription[]): void {
  vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValue(rows);
}

function makeTransaction(name: string): ScopedTransaction {
  return {
    name,
    // A savepoint: its work runs on a nested handle, and a refusal inside it only rolls that back.
    transaction: async (work: (inner: ScopedTransaction) => Promise<unknown>) => {
      events.push(`${name}:savepoint`);
      return work({ name: `${name}-savepoint` } as unknown as ScopedTransaction);
    },
  } as unknown as ScopedTransaction;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findLiveBundledAddOns).mockResolvedValue([]);
  // A business that has paid before and earned nothing: no first-checkout offer applies unless a test says so.
  vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: true } as never);
  vi.mocked(findLifetimeOfferStanding).mockResolvedValue({ claimed: [] });
  vi.mocked(findBusinessCurrency).mockResolvedValue("INR");
  events = [];
  openTransactions = 0;
  transactionCount = 0;
  const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
  provider = {
    ...real,
    startAddOnSubscription: async (input) => {
      events.push(openTransactions === 0 ? "provider:start" : "provider:start INSIDE A TRANSACTION");
      return real.startAddOnSubscription(input);
    },
    cancelSubscription: async (id) => {
      events.push(openTransactions === 0 ? "provider:cancel" : "provider:cancel INSIDE A TRANSACTION");
      return real.cancelSubscription(id);
    },
    cancelSubscriptionAtPeriodEnd: async (id) => {
      events.push(openTransactions === 0 ? "provider:end-at-period-end" : "provider:end-at-period-end INSIDE A TRANSACTION");
      return real.cancelSubscriptionAtPeriodEnd(id);
    },
  };
  cancelled = vi.spyOn(provider, "cancelSubscription");
  endedAtPeriodEnd = vi.spyOn(provider, "cancelSubscriptionAtPeriodEnd");
  started = vi.spyOn(provider, "startAddOnSubscription");
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
        const result = await work(makeTransaction(name));
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
  vi.mocked(getCustomerBusinessKind).mockResolvedValue("website");
  vi.mocked(ensureAddOnPlan).mockResolvedValue(null);
  rowsAre();
  vi.mocked(insertAddOnSubscription).mockImplementation(async (_tx, input) => {
    events.push("record");
    return addOnRow({ ...input, status: "incomplete", activatedAt: null }) as AddOnSubscription;
  });
  vi.mocked(listPressReleasesForBusiness).mockResolvedValue([]);
});

afterEach(() => {
  logged.mockRestore();
  warned.mockRestore();
});

function redirectUrl(outcome: Awaited<ReturnType<typeof startAddOnCheckoutFor>>): URL {
  if (outcome.kind !== "redirect") throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`);
  return new URL(outcome.url, "http://app.localhost");
}

function insertedRow(): Parameters<typeof insertAddOnSubscription>[1] {
  const call = vi.mocked(insertAddOnSubscription).mock.calls[0];
  if (call === undefined) throw new Error("no row was recorded");
  return call[1];
}

const PROVIDER_DOWN = "We couldn't reach the payment provider. Try again in a minute.";

describe("startAddOnCheckoutFor: buy", () => {
  it("decides under the lock, calls the provider with no transaction open, then records in a second one", async () => {
    const outcome = await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    const url = redirectUrl(outcome);
    expect(url.pathname).toBe(FAKE_ADD_ON_CONFIRM_PATH);
    expect(url.searchParams.get("token")).toMatch(/^a1\./);
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "record", "tx2:commit"]);
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `add-on-checkout:business:${BUSINESS_ID}`, ADD_ON_CHECKOUT_RATE_LIMIT);
    expect(ADD_ON_CHECKOUT_RATE_LIMIT).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "tx1" }), BUSINESS_ID);
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "tx2" }), BUSINESS_ID);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("prices Social media with the 5% lifetime offer before the business has paid for its plan, and stores the offer's part", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: false } as never);

    await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(insertedRow()).toMatchObject({
      listAmountCents: 199_900,
      discountAmountCents: 9_995,
      offerDiscountAmountCents: 9_995,
      netAmountCents: 189_905,
      chargedAmountCents: 224_088,
    });
  });

  it("gives the offer to any add-on bought before the first plan payment, each on its own", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: false } as never);

    await startAddOnCheckoutFor(customer, "advertising", "buy", NOW);

    expect(insertedRow()).toMatchObject({ addOn: "advertising", discountAmountCents: 29_995, offerDiscountAmountCents: 29_995, netAmountCents: 569_905 });
  });

  it("leaves an add-on missed at the first checkout at its full price afterwards, while a claimed one keeps the offer", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: true } as never);
    vi.mocked(findLifetimeOfferStanding).mockResolvedValue({ claimed: ["advertising"] });

    await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);
    expect(insertedRow()).toMatchObject({ addOn: "social-media", offerDiscountAmountCents: 0, discountAmountCents: 0, netAmountCents: 199_900 });

    vi.mocked(insertAddOnSubscription).mockClear();
    await startAddOnCheckoutFor(customer, "advertising", "buy", NOW);
    expect(insertedRow()).toMatchObject({ addOn: "advertising", offerDiscountAmountCents: 29_995, netAmountCents: 569_905 });
  });

  it("records a new unpaid row at the full price for a Care client, continuing nothing and starting at once", async () => {
    await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(insertedRow()).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      businessId: BUSINESS_ID,
      addOn: "social-media",
      listAmountCents: 199_900,
      discountAmountCents: 0,
      offerDiscountAmountCents: 0,
      netAmountCents: 199_900,
      taxRateBasisPoints: 1_800,
      chargedAmountCents: 235_882,
      currency: "INR",
      provider: "fake",
      providerSubscriptionId: expect.stringMatching(/^fake_sub_[0-9a-f]{24}$/),
      providerPlanId: null,
      startAt: null,
      continuesId: null,
      contactedAt: null,
      contactedByStaffId: null,
    });
  });

  it("opens the subscription at the provider for the row's own id and charged amount", async () => {
    await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(started).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      addOnSubscriptionId: insertedRow().id,
      providerPlanId: null,
      amountCents: 235_882,
      currency: "INR",
      startAt: null,
    });
  });

  it("prices and charges a business billed in dollars in dollars, with no tax", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue("USD");
    await startAddOnCheckoutFor(customer, "lead-generation", "buy", NOW);

    expect(insertedRow()).toMatchObject({ listAmountCents: 12_500, netAmountCents: 12_500, taxRateBasisPoints: 0, chargedAmountCents: 12_500, currency: "USD" });
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 12_500, currency: "USD" }));
  });

  it("gives a Premium member 10% off: the row holds the discount and the lower charge", async () => {
    await startAddOnCheckoutFor(premiumCustomer, "social-media", "buy", NOW);

    expect(insertedRow()).toMatchObject({ listAmountCents: 199_900, discountAmountCents: 19_990, netAmountCents: 179_910, chargedAmountCents: 212_294 });
    expect(ensureAddOnPlan).toHaveBeenCalledWith(
      expect.anything(),
      provider,
      expect.objectContaining({ price: expect.objectContaining({ discountCents: 19_990, netCents: 179_910, chargedCents: 212_294 }) }),
    );
  });

  it("never gives the discount to a free listing account, whatever its tier says", async () => {
    vi.mocked(getCustomerBusinessKind).mockResolvedValue("listing");

    await startAddOnCheckoutFor(premiumCustomer, "advertising", "buy", NOW);

    expect(insertedRow()).toMatchObject({ addOn: "advertising", discountAmountCents: 0, chargedAmountCents: 707_882 });
  });

  it("stores the provider's plan on the row", async () => {
    vi.mocked(ensureAddOnPlan).mockResolvedValue("plan_abc");

    await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(insertedRow().providerPlanId).toBe("plan_abc");
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ providerPlanId: "plan_abc" }));
  });

  it("buys again after an add-on ended, as a fresh purchase", async () => {
    rowsAre(addOnRow({ status: "cancelled", endKind: "cancel", endRequestedAt: PAID_AT, currentPeriodEnd: new Date(NOW.getTime() - DAY_MS), endedAt: new Date(NOW.getTime() - DAY_MS) }));

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));

    expect(insertedRow()).toMatchObject({ continuesId: null, chargedAmountCents: 235_882 });
  });

  it.each([
    ["running", addOnRow()],
    ["ending", addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT })],
    ["pausing", addOnRow({ endKind: "pause", endRequestedAt: PAID_AT })],
    ["failing", addOnRow({ status: "past_due" })],
  ])("refuses a buy while the add-on is %s", async (_state, row) => {
    rowsAre(row);

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({ kind: "refused", message: "Social media is already running." });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
    expect(started).not.toHaveBeenCalled();
  });

  it("points a buy while paused at Resume, and a buy while failed at Pay now", async () => {
    rowsAre(pausedRow());
    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Social media is paused. Use Resume to start it again.",
    });

    rowsAre(haltedRow(1));
    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Your last Social media payment didn't go through. Use Pay now to fix it.",
    });
  });

  it("treats the other add-on's rows as none of its business", async () => {
    rowsAre(addOnRow({ addOn: "advertising" }));

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));
  });
});

describe("startAddOnCheckoutFor: an unpaid checkout already there", () => {
  /** Razorpay can reopen a subscription it made, so it is the provider a recent checkout can be reused with. */
  function usingRazorpay(): void {
    vi.mocked(getBillingProvider).mockReturnValue({ ...provider, name: "razorpay" });
  }

  it("never reuses a fake provider's checkout, since a fake subscription cannot be reopened: it is replaced", async () => {
    const recent = checkoutRow();
    rowsAre(recent);

    const url = redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));

    expect(url.pathname).toBe(FAKE_ADD_ON_CONFIRM_PATH);
    expect(cancelStaleAddOnCheckout).toHaveBeenCalledWith(expect.objectContaining({ name: "tx2" }), recent.id, NOW);
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "record", "tx2:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(recent.providerSubscriptionId);
  });

  it("sends the customer back to a recent one at the same price, without calling the provider", async () => {
    usingRazorpay();
    const recent = checkoutRow({ provider: "razorpay" });
    rowsAre(recent);

    const outcome = await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(outcome).toEqual({ kind: "redirect", url: `/add-ons/pay/${recent.id}` });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
    expect(started).not.toHaveBeenCalled();
    expect(insertAddOnSubscription).not.toHaveBeenCalled();
    expect(cancelStaleAddOnCheckout).not.toHaveBeenCalled();
  });

  it("replaces one older than 24 hours, cancelling it in the same transaction and at the provider only after the commit", async () => {
    const stale = checkoutRow({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) });
    rowsAre(stale);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));

    expect(cancelStaleAddOnCheckout).toHaveBeenCalledWith(expect.objectContaining({ name: "tx2" }), stale.id, NOW);
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "record", "tx2:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(stale.providerSubscriptionId);
    // The stale one is cancelled before the new one is inserted: the database allows one unpaid checkout.
    expect(vi.mocked(cancelStaleAddOnCheckout).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(insertAddOnSubscription).mock.invocationCallOrder[0] ?? 0);
  });

  it("replaces a recent one opened at another price, such as before the customer became a Premium member", async () => {
    const recent = checkoutRow();
    rowsAre(recent);

    redirectUrl(await startAddOnCheckoutFor(premiumCustomer, "social-media", "buy", NOW));

    expect(cancelStaleAddOnCheckout).toHaveBeenCalledWith(expect.anything(), recent.id, NOW);
    expect(insertedRow()).toMatchObject({ chargedAmountCents: 212_294 });
  });

  it("replaces a recent one that belongs to another intent", async () => {
    const paused = pausedRow();
    const recent = checkoutRow({ continuesId: null });
    rowsAre(recent, paused);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "resume", NOW));

    expect(cancelStaleAddOnCheckout).toHaveBeenCalledWith(expect.anything(), recent.id, NOW);
    expect(insertedRow()).toMatchObject({ continuesId: paused.id });
  });

  it("replaces a recent one opened at a provider other than the configured one", async () => {
    const recent = checkoutRow({ provider: "razorpay" });
    rowsAre(recent);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));

    expect(cancelStaleAddOnCheckout).toHaveBeenCalledWith(expect.anything(), recent.id, NOW);
    // It cannot be cancelled from here, so it is logged for staff instead.
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] provider-cancel-failed /);
  });

  it("logs, and still sends the customer on, when the replaced checkout cannot be cancelled at the provider", async () => {
    rowsAre(checkoutRow({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) }));
    cancelled.mockRejectedValue(new Error("provider unreachable"));

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "buy", NOW));

    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] provider-cancel-failed /);
  });
});

describe("startAddOnCheckoutFor: resume, pay now and keep", () => {
  it("resumes a paused add-on at the price it was bought at, not today's, linked to it and starting at once", async () => {
    const paused = pausedRow();
    rowsAre(paused);

    redirectUrl(await startAddOnCheckoutFor(premiumCustomer, "social-media", "resume", NOW));

    expect(insertedRow()).toMatchObject({
      listAmountCents: 599_900,
      discountAmountCents: 0,
      netAmountCents: 599_900,
      taxRateBasisPoints: 1_800,
      chargedAmountCents: 707_882,
      continuesId: paused.id,
      startAt: null,
      // A resumed add-on is listed for staff again.
      contactedAt: null,
      contactedByStaffId: null,
    });
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 707_882, startAt: null }));
    expect(ensureAddOnPlan).toHaveBeenCalledWith(
      expect.anything(),
      provider,
      expect.objectContaining({ price: { currency: "INR", listCents: 599_900, discountCents: 0, offerCents: 0, netCents: 599_900, taxRateBasisPoints: 1_800, chargedCents: 707_882 } }),
    );
  });

  it("resumes a pause that came due while the paused row is still marked active", async () => {
    rowsAre(addOnRow({ endKind: "pause", endRequestedAt: PAID_AT, currentPeriodEnd: new Date(NOW.getTime() - DAY_MS) }));

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "resume", NOW));
  });

  it("is not fooled by checkouts abandoned since the pause: the paused row is still the one it continues", async () => {
    const paused = pausedRow();
    const abandoned = addOnRow({ status: "cancelled", activatedAt: null, currentPeriodEnd: null, createdAt: new Date(NOW.getTime() - 3 * DAY_MS) });
    rowsAre(abandoned, paused);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "resume", NOW));

    expect(insertedRow().continuesId).toBe(paused.id);
  });

  it("refuses a resume when the add-on is not paused", async () => {
    rowsAre(addOnRow());

    await expect(startAddOnCheckoutFor(customer, "social-media", "resume", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Social media isn't paused, so there is nothing to resume.",
    });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
  });

  it("opens Pay now like a resume inside the grace, keeping the staff's contacted mark", async () => {
    const halted = haltedRow(2);
    rowsAre(halted);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "pay-now", NOW));

    expect(insertedRow()).toMatchObject({
      continuesId: halted.id,
      startAt: null,
      chargedAmountCents: 235_882,
      contactedAt: halted.contactedAt,
      contactedByStaffId: "staff-1",
    });
  });

  it("opens Pay now for a kept subscription whose first charge failed, once the old row has ended", async () => {
    const ended = addOnRow({ status: "cancelled", endKind: "cancel", endRequestedAt: PAID_AT, endedAt: new Date(NOW.getTime() - 3 * DAY_MS) });
    const kept = haltedRow(2, { startAt: new Date(NOW.getTime() - 3 * DAY_MS), currentPeriodEnd: null, activatedAt: null, continuesId: ended.id });
    rowsAre(kept, ended);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "pay-now", NOW));

    expect(insertedRow()).toMatchObject({ continuesId: kept.id, startAt: null, chargedAmountCents: 235_882 });
  });

  it("refuses Pay now once the 7 days are up", async () => {
    rowsAre(haltedRow(8));

    await expect(startAddOnCheckoutFor(customer, "social-media", "pay-now", NOW)).resolves.toEqual({
      kind: "refused",
      message: "The time to pay for Social media has passed. You can buy it again from the Add-ons page.",
    });
    expect(started).not.toHaveBeenCalled();
  });

  it("keeps an ending add-on: the new subscription starts on the old billing date and continues it", async () => {
    const ending = addOnRow({
      endKind: "cancel",
      endRequestedAt: PAID_AT,
      contactedAt: new Date("2026-10-13T09:00:00.000Z"),
      contactedByStaffId: "staff-2",
      discountAmountCents: 19_990,
      netAmountCents: 179_910,
      chargedAmountCents: 212_294,
    });
    rowsAre(ending);

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "keep", NOW));

    expect(insertedRow()).toMatchObject({
      continuesId: ending.id,
      startAt: PERIOD_END,
      chargedAmountCents: 212_294,
      contactedAt: ending.contactedAt,
      contactedByStaffId: "staff-2",
    });
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ startAt: PERIOD_END, amountCents: 212_294 }));
  });

  it("keeps a pausing add-on the same way", async () => {
    rowsAre(addOnRow({ endKind: "pause", endRequestedAt: PAID_AT }));

    redirectUrl(await startAddOnCheckoutFor(customer, "social-media", "keep", NOW));

    expect(insertedRow().startAt).toEqual(PERIOD_END);
  });

  it("refuses to keep an add-on that is not ending, and one already kept", async () => {
    rowsAre(addOnRow());
    await expect(startAddOnCheckoutFor(customer, "social-media", "keep", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Social media isn't about to end, so there is nothing to keep.",
    });

    const kept = addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, activatedAt: null, continuesId: "x" });
    rowsAre(kept, addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT }));
    await expect(startAddOnCheckoutFor(customer, "social-media", "keep", NOW)).resolves.toMatchObject({ kind: "refused" });
  });

  it("refuses a buy while a kept subscription waits to start", async () => {
    rowsAre(addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, activatedAt: null, continuesId: "x" }), addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT }));

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({ kind: "refused", message: "Social media is already running." });
  });
});

describe("startAddOnCheckoutFor: gates and failures", () => {
  it("refuses once the business has used up its attempts, before reading anything", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({
      kind: "refused",
      message: "That's a lot of attempts in a short time. Please wait a little and try again.",
    });
    expect(events).toEqual([]);
    expect(getCustomerBusinessKind).not.toHaveBeenCalled();
  });

  it("refuses with nothing recorded when the provider's plan cannot be made", async () => {
    vi.mocked(ensureAddOnPlan).mockRejectedValue(new Error("Razorpay is down"));

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({ kind: "refused", message: PROVIDER_DOWN });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
    expect(started).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-plan-failed /);
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("Razorpay is down");
  });

  it("refuses with nothing recorded when the provider will not open the subscription", async () => {
    started.mockRejectedValue(new Error("provider unreachable"));

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({ kind: "refused", message: PROVIDER_DOWN });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
    expect(insertAddOnSubscription).not.toHaveBeenCalled();
    expect(cancelStaleAddOnCheckout).not.toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-checkout-failed /);
  });

  it("cancels its own new subscription, records nothing and asks to retry when the add-on changed meanwhile", async () => {
    // A second tab opened a checkout between the two transactions.
    vi.mocked(listAddOnSubscriptionsForBusiness).mockResolvedValueOnce([]).mockResolvedValueOnce([checkoutRow()]);

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Something changed while we were setting up your payment. Please try again.",
    });
    expect(insertAddOnSubscription).not.toHaveBeenCalled();
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "tx2:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(expect.stringMatching(/^fake_sub_[0-9a-f]{24}$/));
    expect(String(warned.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] checkout-orphaned .*changed-meanwhile/);
  });

  it("notices a pause that was undone between the two transactions, and leaves the row it saw alone", async () => {
    const paused = pausedRow();
    vi.mocked(listAddOnSubscriptionsForBusiness)
      .mockResolvedValueOnce([paused])
      .mockResolvedValueOnce([{ ...paused, status: "active", endKind: null }]);

    await expect(startAddOnCheckoutFor(customer, "social-media", "resume", NOW)).resolves.toMatchObject({ kind: "refused" });
    expect(insertAddOnSubscription).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalledWith(paused.providerSubscriptionId);
  });

  it("cancels the orphaned subscription and logs when recording it fails", async () => {
    vi.mocked(insertAddOnSubscription).mockRejectedValue(new Error("connection lost"));

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).rejects.toThrow("connection lost");
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "tx2:rollback", "provider:cancel"]);
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] checkout-orphaned .*record-failed/);
    // The error is named, never quoted: a database error's message carries the failed query's params.
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("connection lost");
  });

  it("refuses to follow a checkout URL that leaves the site insecurely, and cancels what it opened", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({
      ...provider,
      startAddOnSubscription: async () => ({ providerSubscriptionId: `fake_sub_${"b".repeat(24)}`, checkoutUrl: "//evil.example/pay" }),
    });

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).rejects.toBeInstanceOf(UnsafeAddOnCheckoutUrlError);
    expect(insertAddOnSubscription).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledWith(`fake_sub_${"b".repeat(24)}`);
  });

  it("sends a Razorpay customer to the pay page for the new row, since Razorpay gives no URL of its own", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({
      ...provider,
      name: "razorpay",
      startAddOnSubscription: async () => ({ providerSubscriptionId: "sub_Rzp123", checkoutUrl: null }),
    });

    const outcome = await startAddOnCheckoutFor(customer, "social-media", "buy", NOW);

    expect(outcome).toEqual({ kind: "redirect", url: `/add-ons/pay/${insertedRow().id}` });
    expect(insertedRow()).toMatchObject({ provider: "razorpay", providerSubscriptionId: "sub_Rzp123" });
  });

  it("refuses with a plain message and logs when a row holds data no state can be worked out from", async () => {
    rowsAre(addOnRow({ currentPeriodEnd: null }));

    await expect(startAddOnCheckoutFor(customer, "social-media", "buy", NOW)).resolves.toEqual({
      kind: "refused",
      message: "Something is wrong with this add-on. We're looking into it.",
    });
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-view-failed /);
    expect(started).not.toHaveBeenCalled();
  });
});

describe("scheduleAddOnEndFor", () => {
  it("stops an active add-on at the end of the month, outside any transaction, and says when", async () => {
    const row = addOnRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    vi.mocked(scheduleAddOnEnd).mockResolvedValue("scheduled");

    const result = await scheduleAddOnEndFor(customer, row.id, "cancel", NOW);

    expect(result).toEqual({ kind: "done", message: "Social media will stop on 12 November 2026. You won't be charged again." });
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:end-at-period-end", "tx2:begin", "tx2:commit"]);
    expect(endedAtPeriodEnd).toHaveBeenCalledWith(row.providerSubscriptionId);
    expect(scheduleAddOnEnd).toHaveBeenCalledWith(expect.objectContaining({ name: "tx2" }), { id: row.id, kind: "cancel", now: NOW, staffUserId: null });
  });

  it("pauses the same way", async () => {
    const row = addOnRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    vi.mocked(scheduleAddOnEnd).mockResolvedValue("scheduled");

    await expect(scheduleAddOnEndFor(customer, row.id, "pause", NOW)).resolves.toEqual({
      kind: "done",
      message: "Social media will pause on 12 November 2026.",
    });
  });

  it("cancels a kept subscription that has not started and marks it cancelled, which restores the Ending state", async () => {
    const ending = addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT });
    const kept = addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, activatedAt: null, continuesId: ending.id });
    vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => (id === kept.id ? kept : ending));

    const result = await scheduleAddOnEndFor(customer, kept.id, "cancel", NOW);

    expect(result).toEqual({ kind: "done", message: "Social media will stop on 12 November 2026. You won't be charged again." });
    expect(cancelled).toHaveBeenCalledWith(kept.providerSubscriptionId);
    expect(markAddOnCancelled).toHaveBeenCalledWith(expect.objectContaining({ name: "tx2" }), kept.id, NOW);
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
  });

  it("does what Pause says on a kept subscription: the add-on will pause, though the old row was set to cancel", async () => {
    const ending = addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT });
    const kept = addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, activatedAt: null, continuesId: ending.id });
    vi.mocked(findAddOnSubscription).mockImplementation(async (_tx, _businessId, id) => (id === kept.id ? kept : ending));
    vi.mocked(changeAddOnEndKind).mockResolvedValue("changed");

    const result = await scheduleAddOnEndFor(customer, kept.id, "pause", NOW);

    expect(result).toEqual({ kind: "done", message: "Social media will pause on 12 November 2026." });
    expect(changeAddOnEndKind).toHaveBeenCalledWith(expect.objectContaining({ name: "tx2" }), { id: ending.id, kind: "pause", now: NOW, staffUserId: null });
  });

  it("refuses with the provider message and records nothing when the provider cannot be reached", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(addOnRow());
    endedAtPeriodEnd.mockRejectedValue(new Error("provider unreachable"));

    await expect(scheduleAddOnEndFor(customer, "row", "cancel", NOW)).resolves.toEqual({ kind: "refused", message: PROVIDER_DOWN });
    expect(scheduleAddOnEnd).not.toHaveBeenCalled();
  });

  it.each([
    ["not running", addOnRow({ status: "halted" }), "Social media isn't running, so it can't be paused or cancelled."],
    ["already ending", addOnRow({ endKind: "pause", endRequestedAt: PAID_AT }), "Social media is already set to pause on 12 November 2026."],
  ])("refuses a row that is %s, with a clear message", async (_state, row, message) => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(scheduleAddOnEndFor(customer, row.id, "cancel", NOW)).resolves.toEqual({ kind: "refused", message });
    expect(endedAtPeriodEnd).not.toHaveBeenCalled();
  });

  it("refuses a row that is not this business's", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(null);

    await expect(scheduleAddOnEndFor(customer, "0192f3c4-9999-7000-8000-000000000009", "cancel", NOW)).resolves.toEqual({
      kind: "refused",
      message: "We couldn't find that add-on.",
    });
    expect(findAddOnSubscription).toHaveBeenCalledWith(expect.anything(), BUSINESS_ID, "0192f3c4-9999-7000-8000-000000000009");
  });
});

describe("confirmFakeAddOnPaymentFor", () => {
  /** A checkout the fake provider opened for `row`, as the token on its confirm link. */
  async function tokenFor(row: AddOnSubscription, startAt: Date | null = null, businessId = BUSINESS_ID): Promise<string> {
    const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
    const opened = await real.startAddOnSubscription({
      businessId,
      addOnSubscriptionId: row.id,
      providerPlanId: null,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      startAt,
    });
    // The fake provider names the subscription itself, and the row must carry that name.
    row.providerSubscriptionId = opened.providerSubscriptionId;
    return new URL(opened.checkoutUrl ?? "", "http://app.localhost").searchParams.get("token") ?? "";
  }

  beforeEach(() => {
    vi.mocked(applyAddOnPayment).mockImplementation(async () => {
      events.push("apply");
      return { kind: "applied", cancelAtProvider: [] };
    });
    vi.mocked(updateAddOnStatus).mockResolvedValue(true);
  });

  it("records the first payment under the lock, for the month from when it was paid", async () => {
    const row = checkoutRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    const token = await tokenFor(row);

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "paid" });

    expect(events).toEqual(["tx1:begin", "apply", "tx1:commit"]);
    expect(lockBusinessForBilling).toHaveBeenCalledWith(expect.objectContaining({ name: "tx1" }), BUSINESS_ID);
    expect(applyAddOnPayment).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tx1" }),
      {
        addOnSubscriptionId: row.id,
        provider: "fake",
        providerPaymentId: expect.stringMatching(/^fake_pay_[0-9a-f]{24}$/),
        amountCents: 235_882,
        currency: "INR",
        paidAt: NOW,
        periodStart: NOW,
        periodEnd: addMonthsUtc(NOW, 1),
        method: FAKE_PAYMENT_METHOD,
      },
      NOW,
    );
    expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
  });

  it("cancels the halted rows a payment replaced at the provider, after the commit", async () => {
    const row = checkoutRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    vi.mocked(applyAddOnPayment).mockResolvedValue({
      kind: "applied",
      cancelAtProvider: [{ provider: "fake", providerSubscriptionId: `fake_sub_${"c".repeat(24)}` }],
    });

    await confirmFakeAddOnPaymentFor(customer, await tokenFor(row), NOW);

    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(`fake_sub_${"c".repeat(24)}`);
  });

  it("reports a payment that was already recorded, and cancels nothing", async () => {
    const row = checkoutRow({ status: "active" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    vi.mocked(applyAddOnPayment).mockResolvedValue({ kind: "already-recorded", cancelAtProvider: [] });

    await expect(confirmFakeAddOnPaymentFor(customer, await tokenFor(row), NOW)).resolves.toEqual({ kind: "already-recorded" });
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("marks a kept add-on scheduled when the checkout only authorised it, and records no payment", async () => {
    const row = checkoutRow({ startAt: PERIOD_END, continuesId: "x" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(confirmFakeAddOnPaymentFor(customer, await tokenFor(row, PERIOD_END), NOW)).resolves.toEqual({ kind: "authorised" });

    expect(updateAddOnStatus).toHaveBeenCalledWith(expect.objectContaining({ name: "tx1" }), {
      id: row.id,
      status: "scheduled",
      providerStatus: "authenticated",
      now: NOW,
      expectedFrom: "incomplete",
    });
    expect(applyAddOnPayment).not.toHaveBeenCalled();
  });

  it("reports an authorisation that was already recorded, when the row has moved on from incomplete", async () => {
    const row = checkoutRow({ startAt: PERIOD_END, continuesId: "x" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    vi.mocked(updateAddOnStatus).mockResolvedValue(false);

    await expect(confirmFakeAddOnPaymentFor(customer, await tokenFor(row, PERIOD_END), NOW)).resolves.toEqual({ kind: "already-recorded" });
  });

  it("writes nothing and asks for attention when an authorisation names a row that has no start date to be charged on", async () => {
    const row = checkoutRow({ startAt: null });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(confirmFakeAddOnPaymentFor(customer, await tokenFor(row, PERIOD_END), NOW)).resolves.toEqual({ kind: "needs-attention" });

    expect(updateAddOnStatus).not.toHaveBeenCalled();
    expect(applyAddOnPayment).not.toHaveBeenCalled();
    expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
    expect(warned).toHaveBeenCalledWith(expect.stringContaining("confirmation-refused"));
  });

  it("refuses a link for another business without writing anything", async () => {
    const row = checkoutRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(confirmFakeAddOnPaymentFor(customer, await tokenFor(row, null, "0192f3c4-1111-7000-8000-0000000000ff"), NOW)).resolves.toEqual({ kind: "invalid" });
    expect(events).toEqual([]);
    expect(applyAddOnPayment).not.toHaveBeenCalled();
  });

  it("refuses a token that does not check out", async () => {
    await expect(confirmFakeAddOnPaymentFor(customer, "a1.forged.token", NOW)).resolves.toEqual({ kind: "invalid" });
    expect(events).toEqual([]);
  });

  it("refuses a link whose row is missing, or is a different subscription from the one named", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row);

    vi.mocked(findAddOnSubscription).mockResolvedValue(null);
    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "invalid" });

    vi.mocked(findAddOnSubscription).mockResolvedValue({ ...row, providerSubscriptionId: `fake_sub_${"d".repeat(24)}` });
    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "invalid" });
    expect(applyAddOnPayment).not.toHaveBeenCalled();
  });

  it("keeps a payment of another amount than the row's for staff, as the webhook does, and opens nothing", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row);
    vi.mocked(findAddOnSubscription).mockResolvedValue({ ...row, chargedAmountCents: 199_900 });

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "needs-attention" });

    expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tx1" }),
      expect.objectContaining({ addOnSubscriptionId: row.id, amountCents: 235_882, currency: "INR", reason: "amount_mismatch", now: NOW }),
    );
    expect(applyAddOnPayment).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
  });

  it("keeps a payment in another currency than the row's for staff, and opens nothing", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row);
    vi.mocked(findAddOnSubscription).mockResolvedValue({ ...row, currency: "USD" });

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "needs-attention" });

    expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
    expect(applyAddOnPayment).not.toHaveBeenCalled();
  });

  it("asks for attention, and cancels the row's own subscription after the commit, when the money was refused as already_paid", async () => {
    const row = checkoutRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    const token = await tokenFor(row);
    vi.mocked(applyAddOnPayment).mockImplementation(async () => {
      events.push("apply");
      return { kind: "refused", reason: "already_paid", cancelAtProvider: [{ provider: "fake", providerSubscriptionId: row.providerSubscriptionId }] };
    });

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "needs-attention" });

    expect(events).toEqual(["tx1:begin", "apply", "tx1:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(row.providerSubscriptionId);
    expect(warned).toHaveBeenCalledWith(expect.stringContaining("already_paid"));
  });

  it("asks for attention and cancels the row's own subscription when the checkout had been replaced", async () => {
    const row = checkoutRow({ status: "cancelled" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    const token = await tokenFor(row);
    vi.mocked(applyAddOnPayment).mockResolvedValue({
      kind: "refused",
      reason: "checkout_replaced",
      cancelAtProvider: [{ provider: "fake", providerSubscriptionId: row.providerSubscriptionId }],
    });

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).resolves.toEqual({ kind: "needs-attention" });

    expect(cancelled).toHaveBeenCalledWith(row.providerSubscriptionId);
  });

  it("lets any other failure through, cancelling nothing at the provider", async () => {
    const row = checkoutRow();
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);
    const token = await tokenFor(row);
    vi.mocked(applyAddOnPayment).mockRejectedValue(new Error("connection reset"));

    await expect(confirmFakeAddOnPaymentFor(customer, token, NOW)).rejects.toThrow("connection reset");

    expect(cancelled).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe("tx1:rollback");
  });
});

describe("verifyAddOnPaymentFor", () => {
  /** A checkout the fake provider opened for `row`, as the token on its confirm link. */
  async function tokenFor(row: AddOnSubscription, businessId = BUSINESS_ID): Promise<string> {
    const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
    const opened = await real.startAddOnSubscription({
      businessId,
      addOnSubscriptionId: row.id,
      providerPlanId: null,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      startAt: null,
    });
    row.providerSubscriptionId = opened.providerSubscriptionId;
    return new URL(opened.checkoutUrl ?? "", "http://app.localhost").searchParams.get("token") ?? "";
  }

  it("names the add-on and the amount for the customer's own link, reading through row-level security and writing nothing", async () => {
    const row = checkoutRow({ addOn: "advertising" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(verifyAddOnPaymentFor(customer, await tokenFor(row))).resolves.toEqual({
      addOn: "advertising",
      amountCents: 235_882,
      currency: "INR",
      startAt: null,
    });

    expect(withTenantScope).toHaveBeenCalledWith(appDb, customer.tenant, expect.any(Function));
    expect(findAddOnSubscription).toHaveBeenCalledWith(appTx, BUSINESS_ID, row.id);
    expect(getStaffDb).not.toHaveBeenCalled();
    expect(applyAddOnPayment).not.toHaveBeenCalled();
    expect(updateAddOnStatus).not.toHaveBeenCalled();
    expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
  });

  it("says when the row is a keep, by its start date", async () => {
    const startAt = new Date("2026-11-12T04:30:00Z");
    const row = checkoutRow({ startAt });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(verifyAddOnPaymentFor(customer, await tokenFor(row))).resolves.toMatchObject({ startAt });
  });

  it("refuses a link for another business without reading any row", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row, "0192f3c4-1111-7000-8000-0000000000ff");

    await expect(verifyAddOnPaymentFor(customer, token)).resolves.toBeNull();
    expect(findAddOnSubscription).not.toHaveBeenCalled();
  });

  it("refuses a token that does not check out", async () => {
    await expect(verifyAddOnPaymentFor(customer, "a1.forged.token")).resolves.toBeNull();
    expect(findAddOnSubscription).not.toHaveBeenCalled();
  });

  it("refuses a link whose row is missing, or is a different subscription from the one named", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row);

    vi.mocked(findAddOnSubscription).mockResolvedValue(null);
    await expect(verifyAddOnPaymentFor(customer, token)).resolves.toBeNull();

    vi.mocked(findAddOnSubscription).mockResolvedValue({ ...row, providerSubscriptionId: "fake_sub_someoneelse" });
    await expect(verifyAddOnPaymentFor(customer, token)).resolves.toBeNull();
  });

  it("refuses a row that names no add-on on sale", async () => {
    const row = checkoutRow({ addOn: "press-release" });
    vi.mocked(findAddOnSubscription).mockResolvedValue(row);

    await expect(verifyAddOnPaymentFor(customer, await tokenFor(row))).resolves.toBeNull();
  });

  it("lets a failure that is not a refused link through", async () => {
    const row = checkoutRow();
    const token = await tokenFor(row);
    vi.mocked(findAddOnSubscription).mockRejectedValue(new Error("database down"));

    await expect(verifyAddOnPaymentFor(customer, token)).rejects.toThrow("database down");
  });
});

describe("loadAddOnsPage", () => {
  it("reads through row-level security as the signed-in customer", async () => {
    await loadAddOnsPage(customer, NOW);

    expect(withTenantScope).toHaveBeenCalledWith(appDb, customer.tenant, expect.any(Function));
    expect(listAddOnSubscriptionsForBusiness).toHaveBeenCalledWith(appTx, BUSINESS_ID);
    expect(getStaffDb).not.toHaveBeenCalled();
  });

  it("offers a new customer all three add-ons at today's price, and a Premium member the discounted one", async () => {
    const care = await loadAddOnsPage(customer, NOW);
    expect(care.addOns).toEqual([
      expect.objectContaining({ kind: "ready", addOn: "social-media", view: { state: "none" }, actions: ["buy"], endTargetId: null, price: expect.objectContaining({ chargedCents: 235_882 }) }),
      expect.objectContaining({ kind: "ready", addOn: "lead-generation", view: { state: "none" }, actions: ["buy"], price: expect.objectContaining({ chargedCents: 589_882 }) }),
      expect.objectContaining({ kind: "ready", addOn: "advertising", view: { state: "none" }, actions: ["buy"], price: expect.objectContaining({ chargedCents: 707_882 }) }),
    ]);

    const premium = await loadAddOnsPage(premiumCustomer, NOW);
    expect(premium.addOns[0]).toMatchObject({ price: { discountCents: 19_990, chargedCents: 212_294 } });
  });

  it("shows a running add-on at the price it costs, with the buttons for its state and the row they act on", async () => {
    const row = addOnRow({ listAmountCents: 599_900, netAmountCents: 599_900, chargedAmountCents: 707_882 });
    rowsAre(row);

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.addOns[0]).toMatchObject({
      kind: "ready",
      addOn: "social-media",
      view: { state: "active", renewsOn: PERIOD_END },
      actions: ["pause", "cancel"],
      endTargetId: row.id,
      price: { listCents: 599_900, chargedCents: 707_882 },
    });
  });

  it("points Pause and Cancel at a kept subscription that has not started, not at the ending row beneath it", async () => {
    const ending = addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT });
    const kept = addOnRow({ status: "scheduled", startAt: PERIOD_END, currentPeriodEnd: null, activatedAt: null, continuesId: ending.id });
    rowsAre(kept, ending);

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.addOns[0]).toMatchObject({ view: { state: "active", renewsOn: PERIOD_END }, endTargetId: kept.id });
  });

  it("shows a kept subscription whose start day has come with no charge as starting, never renewing on a past date", async () => {
    const startAt = new Date(NOW.getTime() - HOUR_MS);
    const ended = addOnRow({ status: "cancelled", endKind: "cancel", endRequestedAt: PAID_AT, endedAt: startAt });
    const kept = addOnRow({ status: "scheduled", startAt, currentPeriodEnd: null, activatedAt: null, continuesId: ended.id });
    rowsAre(kept, ended);

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.addOns[0]).toMatchObject({ view: { state: "starting", since: startAt }, actions: [], endTargetId: null });
  });

  it("shows the kept subscription as Pay now once its first charge has failed for good", async () => {
    const startAt = new Date(NOW.getTime() - 3 * DAY_MS);
    const ended = addOnRow({ status: "cancelled", endKind: "cancel", endRequestedAt: PAID_AT, endedAt: startAt });
    const kept = haltedRow(2, { startAt, currentPeriodEnd: null, activatedAt: null, continuesId: ended.id });
    rowsAre(kept, ended);

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.addOns[0]).toMatchObject({ view: { state: "failed" }, actions: ["pay-now"] });
  });

  it("offers Resume at the price the paused add-on was bought at, and Keep it for one that is ending", async () => {
    rowsAre(pausedRow());
    expect((await loadAddOnsPage(customer, NOW)).addOns[0]).toMatchObject({ actions: ["resume"], price: { chargedCents: 707_882 } });

    rowsAre(addOnRow({ endKind: "cancel", endRequestedAt: PAID_AT }));
    expect((await loadAddOnsPage(customer, NOW)).addOns[0]).toMatchObject({ view: { state: "ending", endsOn: PERIOD_END }, actions: ["keep"] });
  });

  it("shows one broken row as broken, logs it, and still shows the other add-on", async () => {
    const broken = addOnRow({ currentPeriodEnd: null });
    rowsAre(broken, addOnRow({ addOn: "advertising" }));

    const page = await loadAddOnsPage(customer, NOW);

    expect(page.addOns[0]).toEqual({ kind: "broken", addOn: "social-media", rowId: broken.id });
    expect(page.addOns[2]).toMatchObject({ kind: "ready", addOn: "advertising", view: { state: "active" } });
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[fynix:billing\] add-on-view-failed .*"addOn":"social-media"/);
    expect(String(logged.mock.calls[0]?.[0])).toContain(`"addOnSubscriptionId":"${broken.id}"`);
  });
});

describe("removeBundledAddOnFor", () => {
  const PAID_THROUGH = new Date("2026-11-09T09:00:00.000Z");
  const PROVIDER_SUBSCRIPTION = `fake_sub_${"a".repeat(24)}`;
  const PLAN = { id: "plan-care", code: "care-inr", currency: "INR", providerPlanId: "plan_care_rzp" };
  const bundledRow = (addOn: string, netAmountCents: number, overrides: Record<string, unknown> = {}) => ({
    id: `0192f3c4-5555-7000-8000-${addOn === "social-media" ? "000000000001" : "000000000002"}`,
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
    const social = bundledRow("social-media", 189_905);
    const advertising = bundledRow("advertising", 569_905);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([social, advertising] as never);

    const result = await removeBundledAddOnFor(customer, "social-media", NOW);

    expect(result).toMatchObject({ kind: "scheduled", endsOn: PAID_THROUGH });
    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, PLAN, 0, 569_905);
    expect(changed).toHaveBeenCalledWith(PROVIDER_SUBSCRIPTION, "plan_lower");
    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), { id: social.id, businessId: BUSINESS_ID, pendingBundledAddOnNetCents: 569_905, now: NOW });
    expect(events.filter((event) => event.includes("INSIDE"))).toEqual([]);
  });

  it("moves back to the plan's own provider plan when nothing is left to add", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("social-media", 189_905)] as never);

    await removeBundledAddOnFor(customer, "social-media", NOW);

    expect(ensureDiscountPlan).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith(PROVIDER_SUBSCRIPTION, "plan_care_rzp");
    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingBundledAddOnNetCents: 0 }));
  });

  it("does not count an add-on that is already on its way out toward what is left", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([
      bundledRow("social-media", 189_905),
      bundledRow("advertising", 569_905, { endRequestedAt: new Date("2026-10-15T09:00:00.000Z") }),
    ] as never);

    await removeBundledAddOnFor(customer, "social-media", NOW);

    expect(recordBundledAddOnRemoval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingBundledAddOnNetCents: 0 }));
  });

  it("refuses an add-on that is not part of the plan payment, or is already going, touching nothing", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("advertising", 569_905, { endRequestedAt: NOW })] as never);

    expect(await removeBundledAddOnFor(customer, "social-media", NOW)).toMatchObject({ kind: "refused" });
    expect(await removeBundledAddOnFor(customer, "advertising", NOW)).toMatchObject({ kind: "refused" });
    expect(changed).not.toHaveBeenCalled();
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("changes nothing when the provider refuses", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("social-media", 189_905), bundledRow("advertising", 569_905)] as never);
    changed.mockRejectedValue(new Error("provider unreachable"));

    const result = await removeBundledAddOnFor(customer, "social-media", NOW);

    expect(result).toMatchObject({ kind: "refused" });
    expect(recordBundledAddOnRemoval).not.toHaveBeenCalled();
  });

  it("says so when it was already asked about by the time it is recorded", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([bundledRow("social-media", 189_905)] as never);
    vi.mocked(recordBundledAddOnRemoval).mockResolvedValue(false);

    expect(await removeBundledAddOnFor(customer, "social-media", NOW)).toMatchObject({ kind: "refused" });
  });

  it("stops at the rate limit", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });

    expect(await removeBundledAddOnFor(customer, "social-media", NOW)).toMatchObject({ kind: "refused" });
    expect(findLiveBundledAddOns).not.toHaveBeenCalled();
  });
});
