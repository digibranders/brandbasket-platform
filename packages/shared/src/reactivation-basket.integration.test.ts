import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  cancelStaleSubscription,
  endPackageOffer,
  findActivePlan,
  findChargeForBusiness,
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  isPackageOfferForfeited,
  markCancelRequested,
  markPackageOfferForfeited,
  openBundledAddOn,
  openCheckoutSubscription,
  recordBundledAddOnRemoval,
  setPendingOfferDiscounts,
  updateSubscriptionProviderStatus,
  type BillingCurrency,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { reactivationNetCents } from "./lib/billing/bundle";
import { adCreditCentsFor, packageDiscountsFor, packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateReactivationPayment } from "./server/billing-activation";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
import { loadReactivationBasket } from "./server/reactivation-basket";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * A failed payment keeps the package (docs/plans/16-platform-pricing-offers.md): a business that lapsed reactivates the
 * services it had at the offer they earn, with its ad credit, unless it cancelled. Each case lapses a real subscription
 * and reopens it the way the checkout does: read the basket (loadReactivationBasket), open the replacing subscription with
 * its lines and ad credit, take the payment.
 */

const PAID_AT = new Date("2026-09-01T09:00:00.000Z");
/** After the paid month ran out, so the subscription grants no access. */
const BACK_AT = new Date("2026-10-21T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-21T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;
let sequence = 0;

function linesFor(services: readonly MonthlyAddOnId[], forfeited: boolean): readonly NewBundledAddOn[] {
  return packageLines({ services, forfeited }, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
}

async function setUp(currency: BillingCurrency): Promise<void> {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const found = await findActivePlan(dbs.staff.db, currency, "managed");
  if (found === null) throw new Error(`No active ${currency} services plan was seeded`);
  plan = found;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-back", name: "QA Back Business", currency }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
}

/** A subscription bought together on 1 Sep: first payment taken, so it ran out on 1 Oct and has lapsed by BACK_AT. */
async function lapsedSubscription(services: readonly MonthlyAddOnId[]): Promise<Subscription> {
  sequence += 1;
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${String(sequence).padStart(24, "0")}`,
    adCreditCents: adCreditCentsFor(services, plan.currency),
    bundledAddOns: linesFor(services, false),
    replacing: null,
    now: PAID_AT,
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId: `fake_pay_first_${sequence}`, paidAt: PAID_AT }),
  );
  return subscription;
}

/**
 * What the checkout does for a business that paid before: the basket first, then the replacing subscription at its price. A
 * customer who cancelled themselves buys the services they `chose`; a lapse reopens the basket it had.
 */
async function openReactivation(chose: readonly MonthlyAddOnId[] = []): Promise<Subscription> {
  sequence += 1;
  return dbs.staff.db.transaction(async (tx) => {
    const basket = await loadReactivationBasket(tx, businessId);
    const services = basket.cancelled ? chose : basket.services;
    if (basket.cancelled) await markPackageOfferForfeited(tx, businessId, BACK_AT);
    const latest = await findLatestSubscriptionForBusiness(tx, businessId);
    return openCheckoutSubscription(tx, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${String(sequence).padStart(24, "0")}`,
      adCreditCents: basket.adCreditCents,
      bundledAddOns: linesFor(services, basket.forfeited),
      replacing: latest !== null && latest.status !== "cancelled" ? latest.id : null,
      now: BACK_AT,
    });
  });
}

async function pay(subscription: Subscription): Promise<{ readonly chargedCents: number; readonly invoiceLines: readonly string[]; readonly invoiceTotal: number | undefined }> {
  const activation = await dbs.staff.db.transaction((tx) =>
    activateReactivationPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan,
      provider: "fake",
      providerPaymentId: `fake_pay_back_${subscription.id}`,
      paidAt: BACK_AT,
      paidThroughAt: NEXT_MONTH,
    }),
  );
  const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
  return { chargedCents: activation.payment.amountCents, invoiceLines: invoice?.lines.map((line) => line.description) ?? [], invoiceTotal: invoice?.totalCents };
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a lapsed subscription that is reactivated", () => {
  it.each([
    ["INR", ["managed-website", "digital-growth", "local-seo-aeo"], 3_039_800, 300_000],
    ["INR", ["managed-website", "digital-growth"], 1_169_900, 150_000],
    ["INR", ["managed-website", "local-seo-aeo"], 2_519_900, 0],
    ["INR", ["digital-growth", "local-seo-aeo"], 3_149_900, 150_000],
    ["INR", ["local-seo-aeo"], 2_499_900, 0],
    ["INR", ["managed-website"], 299_900, 0],
    ["USD", ["managed-website", "digital-growth", "local-seo-aeo"], 45_200, 6_000],
    ["USD", ["managed-website", "digital-growth"], 19_400, 2_500],
    ["USD", ["digital-growth", "local-seo-aeo"], 45_000, 2_500],
    ["USD", ["digital-growth"], 15_000, 0],
  ] as const)("keeps its basket at the same offer and its ad credit: %s %j charges %i, credit %i", async (currency, services, charged, adCredit) => {
    await setUp(currency);
    const lapsed = await lapsedSubscription(services);

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(payment.chargedCents).toBe(charged);
    // Only rupee businesses get tax invoices.
    if (currency === "INR") {
      expect(payment.invoiceTotal).toBe(charged);
      expect(payment.invoiceLines).toHaveLength(services.length);
    }
    expect(reopened.adCreditCents).toBe(adCredit);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => row.addOn)).toEqual(services);
    // The old row is history: it grants nothing and no longer owes ad credit.
    expect(await findSubscriptionById(dbs.staff.db, lapsed.id)).toMatchObject({ status: "cancelled", adCreditCents: 0 });
    // Reactivation grants no new credit, takes no code and opens no offer the business did not have.
    expect(reopened).toMatchObject({ referralCodeId: null, discountAmountCents: 0 });
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);
  });

  it("reprices nothing when the unpaid reactivation is abandoned and opened again: the basket and credit carry through", async () => {
    await setUp("INR");
    await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    const abandoned = await openReactivation();
    expect(abandoned.adCreditCents).toBe(300_000);

    const again = await openReactivation();

    expect(again.adCreditCents).toBe(300_000);
    expect(again.bundledAddOnNetCents).toBe(3_039_800);
    expect((await pay(again)).chargedCents).toBe(3_039_800);
    // It never took a payment, so it earned no credit to take back.
    expect(await findSubscriptionById(dbs.staff.db, abandoned.id)).toMatchObject({ status: "cancelled", activatedAt: null });
  });

  it("restores a business that gave the offer up at list with no ad credit, and leaves out the service it dropped", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    const lines = await findBundledAddOnsForSubscription(dbs.staff.db, lapsed.id);
    const dropped = lines.find((row) => row.addOn === "digital-growth");
    const staying = lines.filter((row) => row.addOn !== "digital-growth");
    if (dropped === undefined) throw new Error("The Social Media and Ads line was not opened");
    await recordBundledAddOnRemoval(dbs.staff.db, { id: dropped.id, businessId, pendingBundledAddOnNetCents: 2_799_800, now: new Date("2026-09-20T09:00:00.000Z") });
    await dbs.staff.db.transaction((tx) =>
      endPackageOffer(tx, {
        businessId,
        subscriptionId: lapsed.id,
        lines: staying.map((row) => ({ id: row.id, pendingOfferDiscountAmountCents: 0 })),
        now: new Date("2026-09-20T09:00:00.000Z"),
      }),
    );

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(0);
    expect(payment.chargedCents).toBe(2_799_800);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => [row.addOn, row.netAmountCents])).toEqual([
      ["managed-website", 299_900],
      ["local-seo-aeo", 2_499_900],
    ]);
  });
});

describe("a subscription the provider ended without the customer asking (a revoked mandate)", () => {
  it("is a lapse: the package price, the ad credit and the offer all come back", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "fake",
      providerSubscriptionId: lapsed.providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: new Date("2026-10-01T09:00:00.000Z"),
    });
    expect((await findSubscriptionById(dbs.staff.db, lapsed.id))?.adCreditCents).toBe(300_000);

    const basket = await loadReactivationBasket(dbs.staff.db, businessId);
    expect(basket).toMatchObject({ forfeited: false, adCreditCents: 300_000, cancelled: false });
    expect(reactivationNetCents(basket, "INR")).toBe(3_039_800);

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(300_000);
    expect(payment.chargedCents).toBe(3_039_800);
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);
  });
});

describe("a subscription the customer cancelled", () => {
  it.each([
    [
      "asked to end with its period",
      async (subscription: Subscription) => markCancelRequested(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: new Date("2026-09-25T09:00:00.000Z") }),
    ],
    [
      "asked to end, then ended by the provider",
      async (subscription: Subscription) => {
        await markCancelRequested(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: new Date("2026-09-25T09:00:00.000Z") });
        await updateSubscriptionProviderStatus(dbs.staff.db, {
          provider: "fake",
          providerSubscriptionId: subscription.providerSubscriptionId,
          status: "cancelled",
          providerStatus: "cancelled",
          now: new Date("2026-10-01T09:00:00.000Z"),
        });
      },
    ],
  ] as const)("starts fresh at list with no ad credit, and stays at list for good: %s", async (_label, cancel) => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    await cancel(lapsed);

    const basket = await loadReactivationBasket(dbs.staff.db, businessId);
    expect(basket).toMatchObject({ forfeited: true, adCreditCents: 0, cancelled: true });
    expect(reactivationNetCents(basket, "INR")).toBe(3_799_700);

    const reopened = await openReactivation(["managed-website", "digital-growth", "local-seo-aeo"]);
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(0);
    expect(payment.chargedCents).toBe(3_799_700);
    // Every service is at its own price from now on, a service added later included.
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(true);
  });

  it("charges the services the customer chose again at list, with no offer and no ad credit", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    await markCancelRequested(dbs.staff.db, { subscriptionId: lapsed.id, businessId, now: new Date("2026-09-25T09:00:00.000Z") });

    const reopened = await openReactivation(["managed-website", "local-seo-aeo"]);
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(0);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => [row.addOn, row.listAmountCents, row.netAmountCents])).toEqual([
      ["managed-website", 299_900, 299_900],
      ["local-seo-aeo", 2_499_900, 2_499_900],
    ]);
    // 2,999 + 24,999 = ₹27,998, GST included.
    expect(payment.chargedCents).toBe(2_799_800);
    expect(payment.invoiceLines).toHaveLength(2);
  });

  it("remembers the cancel when the customer opens a checkout, leaves it unpaid and comes back", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth"]);
    await markCancelRequested(dbs.staff.db, { subscriptionId: lapsed.id, businessId, now: new Date("2026-09-25T09:00:00.000Z") });
    const abandoned = await openReactivation(["managed-website"]);
    expect(abandoned.cancelRequestedAt).toBeNull();

    expect(await loadReactivationBasket(dbs.staff.db, businessId)).toMatchObject({ cancelled: true, forfeited: true, adCreditCents: 0 });
  });
});

/** Local SEO + AEO added to the lapsed subscription in the last week of its paid month, at the package price of the three. */
async function addSeoToPaidMonth(lapsed: Subscription, paid: boolean): Promise<void> {
  const current = await findSubscriptionById(dbs.staff.db, lapsed.id);
  if (current?.paidThroughAt == null) throw new Error("The lapsed subscription has no paid month");
  const paidThroughAt = current.paidThroughAt;
  const addedAt = new Date("2026-09-25T09:00:00.000Z");
  const opened = await dbs.staff.db.transaction((tx) =>
    openBundledAddOn(tx, {
      businessId,
      subscriptionId: lapsed.id,
      addOn: "local-seo-aeo",
      listAmountCents: 2_499_900,
      offerDiscountAmountCents: 499_940,
      taxRateBasisPoints: plan.taxRateBasisPoints,
      currency: plan.currency,
      netCents: 500_000,
      chargeCents: 500_000,
      quotedPeriodEnd: paidThroughAt,
      description: "Local SEO + AEO, 25 Sep to 01 Oct 2026",
      staffId: null,
      now: addedAt,
    }),
  );
  if (!paid) return;
  if (opened.chargeId === null) throw new Error("The add had nothing to pay");
  const chargeId = opened.chargeId;
  const charge = await findChargeForBusiness(dbs.staff.db, businessId, chargeId);
  if (charge === null) throw new Error(`No charge ${chargeId} to pay`);
  await dbs.staff.db.transaction(async (tx) => {
    await recordChargePaymentWithInvoice(tx, {
      chargeId,
      businessId,
      provider: "fake",
      providerPaymentId: `fake_pay_add_on_${chargeId}`,
      amountCents: charge.amountCents,
      currency: charge.currency,
      paidAt: addedAt,
      now: addedAt,
    });
    // The services already billed move to the three-service package from the next bill, which never came.
    const lines = (await findBundledAddOnsForSubscription(tx, lapsed.id)).filter((row) => row.addOn !== "local-seo-aeo");
    const threeServices = [...lines.map((row) => ({ addOn: row.addOn as MonthlyAddOnId, listCents: row.listAmountCents })), { addOn: "local-seo-aeo" as const, listCents: 2_499_900 }];
    const discounts = packageDiscountsFor(threeServices, 2_000);
    await setPendingOfferDiscounts(tx, {
      subscriptionId: lapsed.id,
      lines: lines.map((row, index) => ({ id: row.id, pendingOfferDiscountAmountCents: discounts[index] ?? 0 })),
      now: addedAt,
    });
  });
}

describe("a lapsed subscription with an add that was in flight", () => {
  it("leaves out a service added but never paid for, and keeps the package of the services that were billed", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth"]);
    await addSeoToPaidMonth(lapsed, false);

    const basket = await loadReactivationBasket(dbs.staff.db, businessId);
    expect(basket).toEqual({ services: ["managed-website", "digital-growth"], forfeited: false, adCreditCents: 150_000, cancelled: false });

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(payment.chargedCents).toBe(1_169_900);
    expect(reopened.adCreditCents).toBe(150_000);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => row.addOn)).toEqual(["managed-website", "digital-growth"]);
  });

  it("takes a service that was paid for even though the other lines had not yet moved to its package price, and grows no ad credit", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth"]);
    await addSeoToPaidMonth(lapsed, true);
    // The lines still bill at the two-service offer: the renewal that would have moved them never happened.
    const before = await findBundledAddOnsForSubscription(dbs.staff.db, lapsed.id);
    expect(before.filter((row) => row.pendingOfferDiscountAmountCents !== null)).toHaveLength(2);

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    // All three at 20% off, priced from the set, not from what each line was last billed at.
    expect(payment.chargedCents).toBe(3_039_800);
    expect(reopened.adCreditCents).toBe(150_000);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => row.addOn)).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
  });
});

describe("an unpaid reactivation that is dropped", () => {
  it.each([
    [
      "ended by the provider",
      async (subscription: Subscription) =>
        updateSubscriptionProviderStatus(dbs.staff.db, {
          provider: "fake",
          providerSubscriptionId: subscription.providerSubscriptionId,
          status: "cancelled",
          providerStatus: "cancelled",
          now: new Date("2026-10-22T09:00:00.000Z"),
        }),
    ],
    [
      "dropped when the account is deleted",
      async (subscription: Subscription) => cancelStaleSubscription(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: new Date("2026-10-22T09:00:00.000Z") }),
    ],
  ] as const)("is not a cancelled subscription: the package, the ad credit and the offer are kept: %s", async (_label, drop) => {
    await setUp("INR");
    await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    const unpaid = await openReactivation();
    await drop(unpaid);

    const basket = await loadReactivationBasket(dbs.staff.db, businessId);
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
    });

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(300_000);
    expect(payment.chargedCents).toBe(3_039_800);
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);
  });

  it("keeps the lapsed subscription's own state out of it: only the unpaid row is cancelled, and a paid one still zeroes its credit", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    const unpaid = await openReactivation();

    await cancelStaleSubscription(dbs.staff.db, { subscriptionId: unpaid.id, businessId, now: new Date("2026-10-22T09:00:00.000Z") });

    expect(await findSubscriptionById(dbs.staff.db, unpaid.id)).toMatchObject({ status: "cancelled", activatedAt: null, adCreditCents: 300_000 });
    expect(await findSubscriptionById(dbs.staff.db, lapsed.id)).toMatchObject({ status: "cancelled", adCreditCents: 0 });
  });
});
