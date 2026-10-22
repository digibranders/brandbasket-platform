import { chargedAmountCents, createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  businesses,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  listAffiliateEarnings,
  openCheckoutSubscription,
  users,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import type { BasketDeps } from "@brandbasket/shared/server/basket-change";
import { ensureDiscountPlanFor } from "@brandbasket/shared/server/discount-plans";
import { loadCarriedCode, loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A code's discount lasts the code's number of paid months (docs/plans/18-platform-owner-decisions.md, decision 3), through
 * the real webhook handler and a real database: each payment counts a month down, the last one has the provider moved to the
 * amount without the discount, the next renewal is accepted at that amount, and months offline cost nothing.
 */

const state = vi.hoisted(() => ({
  dbs: null as TestDatabases | null,
  /** The provider plans the basket code was moved to, as [net, discount] pairs, in order. */
  plans: [] as { readonly net: number; readonly discount: number }[],
  providerRefuses: false,
  deps: null as (() => BasketDeps) | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
}));
vi.mock("./billing", () => ({ getRazorpayProvider: () => ({ name: "razorpay", fetchSubscriptionStatus: vi.fn() }) }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));
vi.mock("./add-ons", () => ({
  basketDeps: () => {
    if (state.deps === null) throw new Error("The test deps are not set");
    return state.deps();
  },
}));

import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const PROVIDER_SUBSCRIPTION = "sub_rzp_months";
const STAFF_USER = "staff-code";
/** Month n of the subscription: paid on the 19th, the cycle running to the 19th after. */
const CYCLES = ["2026-10-19", "2026-11-19", "2026-12-19", "2027-01-19", "2027-02-19"].map((day) => new Date(`${day}T00:00:00.000Z`));
const PAID_AT = CYCLES[0] ?? new Date();

/** The Managed Website at ₹2,999 with a ₹300 code: the first of the lines every test bills. */
const WEBSITE_NET = 299_900;
const CODE_CENTS = 30_000;
const DISCOUNTED = chargedAmountCents(WEBSITE_NET, CODE_CENTS, 1_800);
const AT_LIST = chargedAmountCents(WEBSITE_NET, 0, 1_800);

function dbs(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

let businessId = "";
let managed: Plan;
let moves: string[];

function razorpay(): BillingProvider {
  const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => PAID_AT });
  return {
    ...real,
    name: "razorpay",
    createPlan: async (input) => ({ providerPlanId: `plan_${input.code}` }),
    changeSubscriptionPlanAtPeriodEnd: async (id) => {
      if (state.providerRefuses) throw new Error("Razorpay is down");
      moves.push(id);
    },
  };
}

function lines(...services: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(services, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

/** A code of ₹300 for `months` paid months (no limit when null), from an affiliate on 5% when `affiliate` is set. */
async function codeFor(months: number | null, affiliate = false): Promise<string> {
  const staff = dbs().staff.db;
  const affiliateId = affiliate
    ? (
        await createAffiliate(staff, {
          name: "Asha Nair",
          email: "asha@example.com",
          phone: null,
          reward: { kind: "percent", basisPoints: 500 },
          rewardCurrency: null,
          rewardCycles: null,
          notes: null,
          createdByStaffId: STAFF_USER,
        })
      ).id
    : null;
  const code = await createReferralCode(staff, {
    code: "THREE",
    currency: "INR",
    affiliateId,
    discount: { kind: "amount", amountCents: CODE_CENTS },
    discountMonths: months,
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  return code.id;
}

/** A Razorpay checkout opened on the code, as openPlanCheckout records it: unpaid, the months copied from the code. */
function openOn(codeId: string, months: number | null, extra: { readonly replacing?: string | null; readonly providerSubscriptionId?: string } = {}): Promise<Subscription> {
  return openCheckoutSubscription(dbs().staff.db, {
    businessId,
    planId: managed.id,
    provider: "razorpay",
    providerSubscriptionId: extra.providerSubscriptionId ?? PROVIDER_SUBSCRIPTION,
    referralCodeId: codeId,
    discountAmountCents: CODE_CENTS,
    discountMonthsLeft: months,
    adCreditCents: 0,
    bundledAddOns: lines("managed-website"),
    replacing: extra.replacing ?? null,
    now: PAID_AT,
  });
}

/** Razorpay takes payment `n` (0 is the first) at `amountCents`. */
async function charge(n: number, amountCents: number, providerSubscriptionId = PROVIDER_SUBSCRIPTION): Promise<void> {
  const paidAt = CYCLES[n] ?? PAID_AT;
  await handleRazorpayWebhookEvent({
    kind: "charged",
    subscriptionId: providerSubscriptionId,
    paymentId: `pay_${providerSubscriptionId}_${n}`,
    amountCents,
    currency: "INR",
    paidAt,
    currentStart: paidAt,
    currentEnd: CYCLES[n + 1] ?? paidAt,
    method: null,
  });
}

async function held(subscription: Subscription) {
  const current = await findSubscriptionById(dbs().staff.db, subscription.id);
  if (current === null) throw new Error("The subscription is gone");
  return current;
}

async function paymentOf(n: number, providerSubscriptionId = PROVIDER_SUBSCRIPTION) {
  const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", `pay_${providerSubscriptionId}_${n}`);
  if (payment === null) throw new Error(`Payment ${n} was not recorded`);
  return payment;
}

beforeAll(() => {
  state.dbs = openTestDatabases();
  state.deps = () => ({
    staffDb: dbs().staff.db,
    provider: razorpay(),
    ensureDiscountPlan: (provider, plan, discount, net) => {
      state.plans.push({ net, discount });
      return ensureDiscountPlanFor(dbs().staff.db, provider, plan, discount, net);
    },
  });
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  const { owner, staff } = dbs();
  await resetTestDatabase(owner);
  await seedPlansFromMigrations(owner);
  const plan = await findActivePlan(staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  managed = plan;
  const rows = await owner.db.insert(businesses).values({ slug: "qa-months", name: "QA Months", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  await owner.db.insert(users).values({ id: STAFF_USER, name: "Staff", email: "staff-code@example.test", emailVerified: true });
  state.plans = [];
  state.providerRefuses = false;
  moves = [];
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a code for 3 months", () => {
  it("discounts payments 1 to 3, has the provider moved at the third, accepts the fourth at list and then takes nothing off", async () => {
    const subscription = await openOn(await codeFor(3), 3);

    await charge(0, DISCOUNTED);
    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 2, discountAmountCents: CODE_CENTS, nextDiscountAmountCents: null });
    await charge(1, DISCOUNTED);
    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 1, nextDiscountAmountCents: null });
    expect(moves).toEqual([]);

    await charge(2, DISCOUNTED);
    // The third payment used the last month: nothing more comes off from the next renewal, and the provider is moved to say so.
    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 0, discountAmountCents: CODE_CENTS, nextDiscountAmountCents: 0 });
    expect(moves).toEqual([PROVIDER_SUBSCRIPTION]);
    expect(state.plans).toEqual([{ net: WEBSITE_NET, discount: 0 }]);
    for (const n of [0, 1, 2]) expect(await paymentOf(n)).toMatchObject({ amountCents: DISCOUNTED, attentionReason: null });

    await charge(3, AT_LIST);
    const fourth = await paymentOf(3);
    expect(fourth).toMatchObject({ amountCents: AT_LIST, attentionReason: null });
    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 0, discountAmountCents: 0, nextDiscountAmountCents: null });
    expect((await findTaxInvoiceByPaymentId(dbs().staff.db, fourth.id))?.lines.map((line) => [line.unitAmountCents, line.discountAmountCents])).toEqual([[WEBSITE_NET, 0]]);
    expect(moves).toHaveLength(1);

    await charge(4, AT_LIST);
    expect(await paymentOf(4)).toMatchObject({ amountCents: AT_LIST, attentionReason: null });
    expect(await held(subscription)).toMatchObject({ discountAmountCents: 0, nextDiscountAmountCents: null });
  });

  it("records a fourth payment at the old discounted amount and flags it for staff, the provider having not moved", async () => {
    const subscription = await openOn(await codeFor(3), 3);
    for (const n of [0, 1, 2]) await charge(n, DISCOUNTED);

    await charge(3, DISCOUNTED);

    expect(await paymentOf(3)).toMatchObject({ amountCents: DISCOUNTED, attentionReason: "add_on_provider_pending" });
    // Nothing was adopted: the subscription still waits for the renewal at the amount without the discount.
    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 0, discountAmountCents: CODE_CENTS, nextDiscountAmountCents: 0 });
    const invoice = await findTaxInvoiceByPaymentId(dbs().staff.db, (await paymentOf(3)).id);
    expect(invoice?.totalCents).toBe(DISCOUNTED);
  });

  it("refuses a renewal at neither amount", async () => {
    const subscription = await openOn(await codeFor(3), 3);
    for (const n of [0, 1, 2]) await charge(n, DISCOUNTED);

    await charge(3, AT_LIST - 1);

    expect(await paymentOf(3)).toMatchObject({ attentionReason: "amount_mismatch" });
    expect(await held(subscription)).toMatchObject({ discountAmountCents: CODE_CENTS, nextDiscountAmountCents: 0 });
  });

  it("counts a payment delivered twice once", async () => {
    const subscription = await openOn(await codeFor(3), 3);

    await charge(0, DISCOUNTED);
    await charge(0, DISCOUNTED);

    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 2 });
  });

  it("flags the subscription for staff when the provider will not move after the last month, and still records the payment", async () => {
    const subscription = await openOn(await codeFor(3), 3);
    await charge(0, DISCOUNTED);
    await charge(1, DISCOUNTED);
    state.providerRefuses = true;

    await expect(charge(2, DISCOUNTED)).resolves.toBeUndefined();

    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 });
    expect(await paymentOf(2)).toMatchObject({ amountCents: DISCOUNTED, attentionReason: "add_on_provider_pending" });
  });
});

describe("a code for 1 month", () => {
  it("ends at the first payment: the provider is moved at once and the second payment is at list", async () => {
    const subscription = await openOn(await codeFor(1), 1);

    await charge(0, DISCOUNTED);

    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 });
    expect(moves).toEqual([PROVIDER_SUBSCRIPTION]);
    expect(state.plans).toEqual([{ net: WEBSITE_NET, discount: 0 }]);

    await charge(1, AT_LIST);
    expect(await paymentOf(1)).toMatchObject({ amountCents: AT_LIST, attentionReason: null });
    expect(await held(subscription)).toMatchObject({ discountAmountCents: 0, nextDiscountAmountCents: null });
  });
});

describe("a code with no limit", () => {
  it("takes the same amount off every month and never moves the provider", async () => {
    const subscription = await openOn(await codeFor(null), null);

    for (const n of [0, 1, 2, 3]) await charge(n, DISCOUNTED);

    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: null, discountAmountCents: CODE_CENTS, nextDiscountAmountCents: null });
    for (const n of [0, 1, 2, 3]) expect(await paymentOf(n)).toMatchObject({ amountCents: DISCOUNTED, attentionReason: null });
    expect(moves).toEqual([]);
  });
});

describe("months offline", () => {
  it("are not counted: only payments count a month down, so a lapse keeps the months left", async () => {
    const subscription = await openOn(await codeFor(3), 3);
    await charge(0, DISCOUNTED);

    // The next payment fails and the plan lapses; weeks pass with nothing paid.
    await execSql(dbs().owner, `update subscriptions set status = 'inactive', provider_status = 'halted' where id = '${subscription.id}'`);

    expect(await held(subscription)).toMatchObject({ discountMonthsLeft: 2 });
    const basket = await loadReactivationBasket(dbs().staff.db, businessId);
    expect(await loadCarriedCode(dbs().staff.db, businessId, basket)).toMatchObject({ monthsLeft: 2, code: { code: "THREE" } });
  });

  it("are carried onto the reactivation, which takes the discounted amount, counts a month and earns the affiliate", async () => {
    const codeId = await codeFor(3, true);
    const lapsed = await openOn(codeId, 3);
    await charge(0, DISCOUNTED);
    await execSql(dbs().owner, `update subscriptions set status = 'inactive', provider_status = 'halted' where id = '${lapsed.id}'`);

    // What openPlanCheckout does for a lapse: the same basket, the code repriced on it, the months copied across.
    const basket = await loadReactivationBasket(dbs().staff.db, businessId);
    const carried = await loadCarriedCode(dbs().staff.db, businessId, basket);
    expect(carried).toMatchObject({ monthsLeft: 2 });
    const back = await openOn(codeId, carried?.monthsLeft ?? null, { replacing: lapsed.id, providerSubscriptionId: "sub_rzp_back" });
    await charge(1, DISCOUNTED, "sub_rzp_back");

    const payment = await paymentOf(1, "sub_rzp_back");
    expect(payment).toMatchObject({ kind: "reactivation", amountCents: DISCOUNTED, attentionReason: null });
    expect(await held(back)).toMatchObject({ discountMonthsLeft: 1, discountAmountCents: CODE_CENTS });
    expect((await findTaxInvoiceByPaymentId(dbs().staff.db, payment.id))?.lines.map((line) => [line.unitAmountCents, line.discountAmountCents])).toEqual([[WEBSITE_NET, CODE_CENTS]]);
    // 5% of what the member paid before GST, as for a renewal.
    const affiliateId = (await dbs().staff.db.query.affiliates.findFirst())?.id ?? "";
    expect(await listAffiliateEarnings(dbs().staff.db, affiliateId, 10)).toMatchObject([
      { paymentKind: "reactivation", basisCents: WEBSITE_NET - CODE_CENTS, amountCents: 13_495 },
      { paymentKind: "initial", basisCents: WEBSITE_NET - CODE_CENTS },
    ]);
  });

  it("have the reactivation that used the last month end the discount and move the provider", async () => {
    const codeId = await codeFor(2);
    const lapsed = await openOn(codeId, 2);
    await charge(0, DISCOUNTED);
    await execSql(dbs().owner, `update subscriptions set status = 'inactive' where id = '${lapsed.id}'`);
    const carried = await loadCarriedCode(dbs().staff.db, businessId, await loadReactivationBasket(dbs().staff.db, businessId));
    const back = await openOn(codeId, carried?.monthsLeft ?? null, { replacing: lapsed.id, providerSubscriptionId: "sub_rzp_back" });

    await charge(1, DISCOUNTED, "sub_rzp_back");

    expect(await held(back)).toMatchObject({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 });
    expect(moves).toEqual(["sub_rzp_back"]);
  });

  it("are not carried after the client's own cancel, nor once they have run out", async () => {
    const codeId = await codeFor(3);
    const subscription = await openOn(codeId, 3);
    await charge(0, DISCOUNTED);

    await execSql(dbs().owner, `update subscriptions set status = 'cancelled', cancel_requested_at = '${(CYCLES[1] ?? PAID_AT).toISOString()}' where id = '${subscription.id}'`);
    expect(await loadCarriedCode(dbs().staff.db, businessId, await loadReactivationBasket(dbs().staff.db, businessId))).toBeNull();

    // Not the client's own cancel (a revoked mandate), but the months are used up.
    await execSql(dbs().owner, `update subscriptions set cancel_requested_at = null, discount_months_left = 0 where id = '${subscription.id}'`);
    expect(await loadCarriedCode(dbs().staff.db, businessId, await loadReactivationBasket(dbs().staff.db, businessId))).toBeNull();
  });
});
