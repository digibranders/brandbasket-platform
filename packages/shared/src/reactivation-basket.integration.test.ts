import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  cancelStaleSubscription,
  endPackageOffer,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  isPackageOfferForfeited,
  markCancelRequested,
  markPackageOfferForfeited,
  openCheckoutSubscription,
  recordBundledAddOnRemoval,
  updateSubscriptionProviderStatus,
  type BillingCurrency,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { reactivationNetCents } from "./lib/billing/bundle";
import { adCreditCentsFor, packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateReactivationPayment } from "./server/billing-activation";
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

/** What the checkout does for a business that paid before: the basket first, then the replacing subscription at its price. */
async function openReactivation(): Promise<Subscription> {
  sequence += 1;
  return dbs.staff.db.transaction(async (tx) => {
    const basket = await loadReactivationBasket(tx, businessId);
    if (basket.cancelled) await markPackageOfferForfeited(tx, businessId, BACK_AT);
    const latest = await findLatestSubscriptionForBusiness(tx, businessId);
    return openCheckoutSubscription(tx, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${String(sequence).padStart(24, "0")}`,
      adCreditCents: basket.adCreditCents,
      bundledAddOns: linesFor(basket.services, basket.forfeited),
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
    ["INR", ["managed-website", "digital-growth", "local-seo-aeo"], 3_138_800, 500_000],
    ["INR", ["managed-website", "digital-growth"], 1_227_200, 200_000],
    ["INR", ["managed-website", "local-seo-aeo"], 2_643_200, 0],
    ["INR", ["digital-growth", "local-seo-aeo"], 2_891_000, 200_000],
    ["INR", ["local-seo-aeo"], 2_950_000, 0],
    ["INR", ["managed-website"], 354_000, 0],
    ["USD", ["managed-website", "digital-growth", "local-seo-aeo"], 35_000, 6_000],
    ["USD", ["managed-website", "digital-growth"], 12_000, 2_500],
    ["USD", ["digital-growth", "local-seo-aeo"], 29_750, 2_500],
    ["USD", ["digital-growth"], 7_500, 0],
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
    expect(abandoned.adCreditCents).toBe(500_000);

    const again = await openReactivation();

    expect(again.adCreditCents).toBe(500_000);
    expect(again.bundledAddOnNetCents).toBe(2_660_000);
    expect((await pay(again)).chargedCents).toBe(3_138_800);
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
    await recordBundledAddOnRemoval(dbs.staff.db, { id: dropped.id, businessId, pendingBundledAddOnNetCents: 2_800_000, now: new Date("2026-09-20T09:00:00.000Z") });
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
    expect(payment.chargedCents).toBe(3_304_000);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, reopened.id)).map((row) => [row.addOn, row.netAmountCents])).toEqual([
      ["managed-website", 300_000],
      ["local-seo-aeo", 2_500_000],
    ]);
  });
});

describe("a subscription that was cancelled", () => {
  it.each([
    [
      "asked to end with its period",
      async (subscription: Subscription) => markCancelRequested(dbs.staff.db, { subscriptionId: subscription.id, businessId, now: new Date("2026-09-25T09:00:00.000Z") }),
    ],
    [
      "ended by the provider",
      async (subscription: Subscription) =>
        updateSubscriptionProviderStatus(dbs.staff.db, {
          provider: "fake",
          providerSubscriptionId: subscription.providerSubscriptionId,
          status: "cancelled",
          providerStatus: "cancelled",
          now: new Date("2026-10-01T09:00:00.000Z"),
        }),
    ],
  ] as const)("starts fresh at list with no ad credit, and stays at list for good: %s", async (_label, cancel) => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    await cancel(lapsed);
    expect((await findSubscriptionById(dbs.staff.db, lapsed.id))?.adCreditCents).toBe(0);

    const basket = await loadReactivationBasket(dbs.staff.db, businessId);
    expect(basket).toMatchObject({ forfeited: true, adCreditCents: 0, cancelled: true });
    expect(reactivationNetCents(basket, "INR")).toBe(3_800_000);

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(0);
    expect(payment.chargedCents).toBe(4_484_000);
    // Every service is at its own price from now on, a service added later included.
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(true);
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
      adCreditCents: 500_000,
      cancelled: false,
    });

    const reopened = await openReactivation();
    const payment = await pay(reopened);

    expect(reopened.adCreditCents).toBe(500_000);
    expect(payment.chargedCents).toBe(3_138_800);
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);
  });

  it("keeps the lapsed subscription's own state out of it: only the unpaid row is cancelled, and a paid one still zeroes its credit", async () => {
    await setUp("INR");
    const lapsed = await lapsedSubscription(["managed-website", "digital-growth", "local-seo-aeo"]);
    const unpaid = await openReactivation();

    await cancelStaleSubscription(dbs.staff.db, { subscriptionId: unpaid.id, businessId, now: new Date("2026-10-22T09:00:00.000Z") });

    expect(await findSubscriptionById(dbs.staff.db, unpaid.id)).toMatchObject({ status: "cancelled", activatedAt: null, adCreditCents: 500_000 });
    expect(await findSubscriptionById(dbs.staff.db, lapsed.id)).toMatchObject({ status: "cancelled", adCreditCents: 0 });
  });
});
