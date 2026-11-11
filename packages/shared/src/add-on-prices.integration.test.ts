import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  completeBundledAddOnChanges,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findChargeForBusiness,
  findSubscriptionById,
  openCheckoutSubscription,
  type BundledAddOn,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundledLinePrice, bundleLines } from "./lib/billing/bundle";
import { activateFirstPayment } from "./server/billing-activation";
import { finishAddOnAfterPayment, readAddOnAssessment, startAddOn, type BasketDeps } from "./server/basket-change";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
import { ensureDiscountPlanFor } from "./server/discount-plans";

vi.mock("server-only", () => ({}));

/**
 * The prices a customer is shown and charged as services are added one by one to a running plan, against a real database:
 * Website Management, then Social Media Management, then Paid Ads Management, each added the day the month was paid for (so the whole
 * month is left and the charge is the line's full monthly price).
 */

const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
/** An hour into the paid month: a whole 31 days (rounded up) are left, so nothing is prorated. */
const ADDED_AT = new Date("2026-10-19T01:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let managed: Plan;
let provider: BillingProvider;

function deps(): BasketDeps {
  return { staffDb: dbs.staff.db, provider, ensureDiscountPlan: (p, plan, discount, net) => ensureDiscountPlanFor(dbs.staff.db, p, plan, discount, net) };
}

function bundleOf(...ids: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(ids, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

async function paidSubscription(bundled: readonly NewBundledAddOn[]): Promise<Subscription> {
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: managed.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    adCreditCents: 0,
    bundledAddOns: bundled,
    replacing: null,
    now: PAID_AT,
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan: managed, provider: "fake", providerPaymentId: "fake_pay_first", paidAt: PAID_AT, discountAmountCents: 0 }),
  );
  const paid = await findSubscriptionById(dbs.staff.db, subscription.id);
  if (paid?.paidThroughAt == null) throw new Error("The first payment left nothing paid through");
  return paid;
}

/** Adds a service as the customer does: the charge, its payment, and the provider step after it. Returns what was charged. */
async function addAndPay(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<number> {
  const started = await startAddOn(deps(), { businessId, addOn, staffId: null, now: ADDED_AT });
  if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
  const charge = await findChargeForBusiness(dbs.staff.db, businessId, started.chargeId);
  if (charge === null) throw new Error("The charge is missing");
  await dbs.staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, {
      chargeId: started.chargeId,
      businessId,
      provider: "fake",
      providerPaymentId: `fake_pay_${addOn}`,
      amountCents: charge.amountCents,
      currency: charge.currency,
      paidAt: ADDED_AT,
      now: ADDED_AT,
    }),
  );
  expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: started.chargeId, now: ADDED_AT })).toEqual({ kind: "scheduled" });
  return charge.amountCents;
}

async function rowsOf(subscription: Subscription): Promise<readonly BundledAddOn[]> {
  return findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  managed = plan;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-money", name: "QA Money", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  provider = { ...createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => ADDED_AT }), changeSubscriptionPlanAtPeriodEnd: async () => undefined };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a website client adds Social Media Management, then Paid Ads Management, on the day the month was paid", () => {
  /** What the Your plan page shows for each service the plan holds, in the catalogue's order. */
  async function cards(subscription: Subscription): Promise<Record<string, number>> {
    const rows = (await rowsOf(subscription)).filter((row) => row.status === "active" && row.endRequestedAt === null);
    return Object.fromEntries(rows.map((row) => [row.addOn, bundledLinePrice(row, "INR").netCents]));
  }

  async function offer(addOn: "social-media" | "paid-ads") {
    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn, providerName: "fake", now: ADDED_AT });
    if (assessment?.kind !== "offer") throw new Error(`Expected an offer, got ${assessment?.kind}`);
    return assessment;
  }

  async function renewalAmount(subscription: Subscription): Promise<number> {
    const fresh = await findSubscriptionById(dbs.staff.db, subscription.id);
    return (fresh?.pendingBundledAddOnNetCents ?? fresh?.bundledAddOnNetCents ?? 0) + managed.recurringAmountCents;
  }

  it("charges and renews every service at list at each step, and the cards add up to the next renewal", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website"));

    // Step 1: Website + Social is two plans at list, ₹2,999 each, so ₹5,998 a month and no discount.
    const social = await offer("social-media");
    expect(social.line.netCents).toBe(299_900);
    expect(social.quote).toMatchObject({ chargeCents: 299_900, nextRenewalCents: 599_800 });
    const socialCharge = await addAndPay("social-media");
    expect(socialCharge).toBe(299_900);
    expect(await renewalAmount(subscription)).toBe(599_800);
    expect(await cards(subscription)).toEqual({ "managed-website": 299_900, "social-media": 299_900 });

    // Step 2: all three at list is ₹8,997 a month, with no discount.
    const ads = await offer("paid-ads");
    expect(ads.line.netCents).toBe(299_900);
    expect(ads.quote).toMatchObject({ chargeCents: 299_900, nextRenewalCents: 899_700 });
    const adsCharge = await addAndPay("paid-ads");
    expect(adsCharge).toBe(299_900);
    expect(await renewalAmount(subscription)).toBe(899_700);
    const shown = await cards(subscription);
    expect(shown).toEqual({ "managed-website": 299_900, "social-media": 299_900, "paid-ads": 299_900 });
    expect(Object.values(shown).reduce((total, net) => total + net, 0)).toBe(899_700);

    // The month that was paid for is ₹2,999 for each of the three, and the renewal is the same ₹8,997.
    expect(299_900 + socialCharge + adsCharge).toBe(899_700);

    // After the renewal the cards are the same, and equal what a customer who bought all three at once sees.
    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: subscription.paidThroughAt ?? PAID_AT }));
    expect(await cards(subscription)).toEqual(shown);
    expect(Object.fromEntries(bundleLines(["managed-website", "social-media", "paid-ads"], "INR").map((line) => [line.addOn, line.netCents]))).toEqual(shown);
  });
});
