import { chargedAmountCents, createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BundledAddOnNotPossibleError,
  bundledAddOns,
  businesses,
  completeBundledAddOnChanges,
  confirmKeptSubscription,
  createReferralCode,
  endPackageOffer,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findChargeForBusiness,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  keepBundledAddOn,
  markBundledAddOnsScheduled,
  markPackageOfferForfeited,
  openBundledAddOn,
  openCheckoutSubscription,
  openKeptSubscription,
  recordBundledAddOnRemoval,
  renewalBundledLines,
  subscriptions,
  waiveCharge,
  users,
  type BundledAddOn,
  type NewAddedAddOn,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "./lib/billing/bundle";
import { activateFirstPayment, activateRenewalPayment } from "./server/billing-activation";
import {
  addOnChargeDescription,
  finishAddOnAfterPayment,
  moveBasketAtProvider,
  readAddOnAssessment,
  removeBundledAddOn,
  startAddOn,
  type BasketDeps,
} from "./server/basket-change";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
import { ensureDiscountPlanFor } from "./server/discount-plans";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));
// The database writes of a removal pass through unchanged unless a test makes one throw.
vi.mock("@brandbasket/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@brandbasket/db")>();
  return { ...actual, endPackageOffer: vi.fn(actual.endPackageOffer), recordBundledAddOnRemoval: vi.fn(actual.recordBundledAddOnRemoval) };
});

/**
 * Adding an add-on to a plan that is already running (docs/plans/13-platform-add-ons-after-signup.md in the BrandBasket
 * workspace), against a real database.
 */

const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
const FIFTH_NOV = new Date("2026-11-05T06:00:00.000Z");

// Each test's database holds one business with one subscription, so a subscription update needs no filter.
let dbs: TestDatabases;
let businessId = "";
let managed: Plan;

function bundleOf(...ids: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(ids, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

/** A subscription on the services plan, paid on 19 Oct with the given services (the website alone unless told), as it now stands. */
async function paidSubscription(
  bundled: readonly NewBundledAddOn[] = bundleOf("managed-website"),
  options: { readonly adCreditCents?: number; readonly referralCodeId?: string; readonly discountAmountCents?: number; readonly discountMonthsLeft?: number } = {},
): Promise<Subscription> {
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: managed.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    referralCodeId: options.referralCodeId ?? null,
    discountAmountCents: options.discountAmountCents ?? 0,
    ...(options.discountMonthsLeft === undefined ? {} : { discountMonthsLeft: options.discountMonthsLeft }),
    adCreditCents: options.adCreditCents ?? 0,
    bundledAddOns: bundled,
    replacing: null,
    now: PAID_AT,
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan: managed,
      provider: "fake",
      providerPaymentId: "fake_pay_first",
      paidAt: PAID_AT,
      discountAmountCents: options.discountAmountCents ?? 0,
    }),
  );
  const paid = await findSubscriptionById(dbs.staff.db, subscription.id);
  if (paid?.paidThroughAt == null) throw new Error("The first payment left nothing paid through");
  return paid;
}

/** Social Media and Ads added on 5 Nov at the worked example's quote, unless told otherwise. */
function addition(subscription: Subscription, overrides: Partial<NewAddedAddOn> = {}): NewAddedAddOn {
  return {
    businessId,
    subscriptionId: subscription.id,
    addOn: "digital-growth",
    listAmountCents: 999_900,
    offerDiscountAmountCents: 0,
    taxRateBasisPoints: 1_800,
    currency: "INR",
    netCents: 451_568,
    chargeCents: 451_568,
    quotedPeriodEnd: subscription.paidThroughAt ?? PAID_AT,
    description: "Social Media and Ads, 05 Nov to 18 Nov 2026",
    staffId: null,
    now: FIFTH_NOV,
    ...overrides,
  };
}

function open(input: NewAddedAddOn) {
  return dbs.staff.db.transaction((tx) => openBundledAddOn(tx, input));
}

/** Pays a charge in full, unless told the amount the provider took. */
async function pay(chargeId: string, providerPaymentId = "fake_pay_add_on", amountCents?: number) {
  const charge = await findChargeForBusiness(dbs.staff.db, businessId, chargeId);
  if (charge === null) throw new Error(`No charge ${chargeId} to pay`);
  return dbs.staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, {
      chargeId,
      businessId,
      provider: "fake",
      providerPaymentId,
      amountCents: amountCents ?? charge.amountCents,
      currency: charge.currency,
      paidAt: FIFTH_NOV,
      now: FIFTH_NOV,
    }),
  );
}

async function rowsOf(subscription: Subscription): Promise<readonly BundledAddOn[]> {
  return findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
}

/** The statuses of one add-on's rows, oldest first (the website a subscription is opened with is left out). */
async function statusesOf(subscription: Subscription, addOn = "digital-growth"): Promise<readonly string[]> {
  return (await rowsOf(subscription)).filter((row) => row.addOn === addOn).map((row) => row.status);
}

async function rowFor(subscription: Subscription, addOn: string): Promise<BundledAddOn> {
  const live = (await rowsOf(subscription)).filter((row) => row.addOn === addOn && row.status !== "removed");
  const row = live[0];
  if (row === undefined) throw new Error(`No live ${addOn} row`);
  return row;
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
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-add-later", name: "QA Add Later", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the add-on rows", () => {
  it("records when an add-on taken at sign-up became part of the monthly amount", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));

    const [row] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(row).toMatchObject({ status: "active", billedFrom: PAID_AT });
  });

  it("lets a subscription take an add-on again after an earlier one stopped, but never hold two live at once", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    await dbs.owner.db.update(bundledAddOns).set({ status: "removed", removedAt: FIFTH_NOV });
    const again = { businessId, subscriptionId: subscription.id, addOn: "digital-growth", listAmountCents: 999_900, netAmountCents: 999_900, taxRateBasisPoints: 1_800 };

    await dbs.owner.db.insert(bundledAddOns).values({ ...again, status: "active" });

    await expect(dbs.owner.db.insert(bundledAddOns).values({ ...again, status: "pending" })).rejects.toThrow();
  });
});

describe("adding an add-on to a running plan", () => {
  it("opens a charge for the rest of the month, with the add-on waiting for it and the subscription untouched", async () => {
    const subscription = await paidSubscription();

    const opened = await open(addition(subscription));

    expect(opened.chargeId).not.toBeNull();
    const charge = await findChargeForBusiness(dbs.staff.db, businessId, opened.chargeId ?? "");
    expect(charge).toMatchObject({ kind: "add_on", status: "open", unitAmountCents: 451_568, amountCents: 451_568, quantity: 1, description: "Social Media and Ads, 05 Nov to 18 Nov 2026" });
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({
      status: "pending",
      chargeId: opened.chargeId,
      listAmountCents: 999_900,
      offerDiscountAmountCents: 0,
      netAmountCents: 999_900,
      quotedPeriodEnd: subscription.paidThroughAt,
      billedFrom: null,
    });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 299_900, pendingBundledAddOnNetCents: null });
  });

  it("replaces an earlier open charge for the same add-on", async () => {
    const subscription = await paidSubscription();
    const first = await open(addition(subscription));

    const second = await open(addition(subscription, { netCents: 293_548, chargeCents: 293_548 }));

    expect(second.chargeId).not.toBe(first.chargeId);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, first.chargeId ?? "")).toMatchObject({ status: "waived" });
    expect(await statusesOf(subscription)).toEqual(["removed", "pending"]);
  });

  it("replaces an open charge for another add-on too, since its price was quoted for a basket that has changed", async () => {
    const subscription = await paidSubscription();
    const social = await open(addition(subscription));

    const seo = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_499_900, netCents: 1_128_987, chargeCents: 1_128_987 }));

    expect(seo.chargeId).not.toBe(social.chargeId);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, social.chargeId ?? "")).toMatchObject({ status: "waived" });
    expect(await findChargeForBusiness(dbs.staff.db, businessId, seo.chargeId ?? "")).toMatchObject({ status: "open" });
    expect(await statusesOf(subscription, "digital-growth")).toEqual(["removed"]);
    expect(await statusesOf(subscription, "local-seo-aeo")).toEqual(["pending"]);
  });

  it("turns the add-on on when its charge is paid, invoices the charge, and carries the higher amount the renewal must arrive at", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));

    const recorded = await pay(opened.chargeId ?? "", "fake_pay_add_on", 451_568);

    expect(recorded.outcome).toBe("paid");
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", activatedAt: FIFTH_NOV, billedFrom: null });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 299_900, pendingBundledAddOnNetCents: 1_299_800 });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
    expect(invoice?.totalCents).toBe(451_568);
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Social Media and Ads, 05 Nov to 18 Nov 2026"]);
  });

  it("applies nothing for a payment that is not the charge's amount, and flags it", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));

    const recorded = await pay(opened.chargeId ?? "", "fake_pay_add_on", 451_567);

    expect(recorded.outcome).toBe("amount-mismatch");
    expect(recorded.payment.attentionReason).toBe("amount_mismatch");
    expect(await statusesOf(subscription)).toEqual(["pending"]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: null });
  });

  it("applies nothing for a charge paid after the month renewed, and keeps the money for a refund", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));
    await dbs.owner.db.update(subscriptions).set({ paidThroughAt: new Date("2026-12-19T00:00:00.000Z") });

    const recorded = await pay(opened.chargeId ?? "");

    expect(recorded.outcome).toBe("add-on-not-applied");
    expect(recorded.payment.attentionReason).toBe("add_on_not_applied");
    expect(await statusesOf(subscription)).toEqual(["removed"]);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, opened.chargeId ?? "")).toMatchObject({ status: "waived" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: null });
  });

  it("drops the waiting add-on when staff waive its charge", async () => {
    const subscription = await paidSubscription();
    await dbs.owner.db.insert(users).values({ id: "staff-add", name: "Staff", email: "staff-add@example.test", emailVerified: true });
    const opened = await open(addition(subscription));

    await waiveCharge(dbs.staff.db, { chargeId: opened.chargeId ?? "", businessId, staffId: "staff-add", now: FIFTH_NOV });

    expect(await statusesOf(subscription)).toEqual(["removed"]);
  });

  it("turns the add-on on at once when its share is too small to charge", async () => {
    const subscription = await paidSubscription();

    const opened = await open(addition(subscription, { netCents: 50, chargeCents: 0 }));

    expect(opened.chargeId).toBeNull();
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", activatedAt: FIFTH_NOV, chargeId: null, billedFrom: null });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_299_800 });
  });

  it("refuses an add-on already in the plan payment", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));

    await expect(open(addition(subscription))).rejects.toMatchObject({ reason: "already-added" });
  });

  it.each([
    ["asked to leave", { cancelRequestedAt: FIFTH_NOV }],
    ["not active", { status: "past_due" as const }],
    ["renewed since the quote", { paidThroughAt: new Date("2026-12-19T00:00:00.000Z") }],
  ])("refuses a subscription that has %s", async (_case, change) => {
    const subscription = await paidSubscription();
    await dbs.owner.db.update(subscriptions).set(change);

    const refusal = open(addition(subscription));
    await expect(refusal).rejects.toBeInstanceOf(BundledAddOnNotPossibleError);
    await expect(refusal).rejects.toMatchObject({ reason: "not-live" });
  });

  it("leaves an add-on that is on its way out out of the new amount", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    const growth = await rowFor(subscription, "digital-growth");
    await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });

    const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_499_900, netCents: 1_128_987, chargeCents: 1_128_987 }));
    await pay(opened.chargeId ?? "", "fake_pay_seo");

    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 999_900, pendingBundledAddOnNetCents: 2_499_900 });
  });

  describe("keeping an add-on that was asked to stop", () => {
    it("clears the request, and the amount goes back to what is billed now", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"));
      const growth = await rowFor(subscription, "digital-growth");
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });

      expect(await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: FIFTH_NOV }))).toBe(true);

      expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", endRequestedAt: null });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 999_900, pendingBundledAddOnNetCents: null });
    });

    it("keeps the higher amount waiting when another add-on was added this month", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"));
      const growth = await rowFor(subscription, "digital-growth");
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });
      const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_499_900, netCents: 1_128_987, chargeCents: 1_128_987 }));
      await pay(opened.chargeId ?? "", "fake_pay_seo");

      await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: FIFTH_NOV }));

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 999_900 + 2_499_900 });
    });

    it("does nothing for an add-on that is not ending, or is another business's", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"));
      const growth = await rowFor(subscription, "digital-growth");

      expect(await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: FIFTH_NOV }))).toBe(false);
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });
      const other = await dbs.owner.db.insert(businesses).values({ slug: "qa-other", name: "Other", currency: "INR" }).returning({ id: businesses.id });
      expect(await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId: other[0]?.id ?? "", now: FIFTH_NOV }))).toBe(false);
    });
  });

  it("stamps the added add-ons once the provider has been told, and only those", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_499_900, netCents: 1_128_987, chargeCents: 1_128_987 }));
    await pay(opened.chargeId ?? "", "fake_pay_seo");

    expect(await markBundledAddOnsScheduled(dbs.staff.db, { subscriptionId: subscription.id, now: FIFTH_NOV })).toBe(1);

    expect((await rowsOf(subscription)).map((row) => [row.addOn, row.providerScheduledAt])).toEqual([
      ["digital-growth", null],
      ["local-seo-aeo", FIFTH_NOV],
    ]);
    expect(await markBundledAddOnsScheduled(dbs.staff.db, { subscriptionId: subscription.id, now: FIFTH_NOV })).toBe(0);
  });

  it("bills the added add-on from the renewal that takes the new amount", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));
    await pay(opened.chargeId ?? "");
    const renewedAt = subscription.paidThroughAt ?? PAID_AT;

    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: renewedAt }));

    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", billedFrom: renewedAt });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_299_800, pendingBundledAddOnNetCents: null });
  });
});

describe("the add-on flow, with the provider", () => {
  let moves: string[];
  let provider: BillingProvider;

  function deps(overrides: Partial<BillingProvider> = {}): BasketDeps {
    return {
      staffDb: dbs.staff.db,
      provider: { ...provider, ...overrides },
      ensureDiscountPlan: (p, plan, discount, net) => ensureDiscountPlanFor(dbs.staff.db, p, plan, discount, net),
    };
  }

  beforeEach(() => {
    moves = [];
    const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => FIFTH_NOV });
    provider = {
      ...real,
      changeSubscriptionPlanAtPeriodEnd: async (id) => {
        moves.push(id);
      },
    };
  });

  it("quotes the new line at its package price for the days left of the subscription's own month", async () => {
    await paidSubscription();

    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV });

    expect(assessment).toMatchObject({
      kind: "offer",
      line: { listCents: 999_900, discountCents: 99_910, netCents: 899_990 },
      quote: { daysLeft: 14, periodDays: 31, netCents: 406_447, chargeCents: 406_447, nextRenewalCents: 1_169_900 },
    });
    expect(addOnChargeDescription("digital-growth", FIFTH_NOV, new Date("2026-11-19T00:00:00.000Z"))).toBe("Social Media and Ads, 05 Nov to 18 Nov 2026");
  });

  it("opens one charge however often Add is pressed, and tells the provider once it is paid, once", async () => {
    const subscription = await paidSubscription();
    const first = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    const again = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    if (first.kind !== "pay") throw new Error(`Expected a charge, got ${first.kind}`);
    expect(again).toEqual(first);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, first.chargeId)).toMatchObject({ amountCents: 406_447, description: "Social Media and Ads, 05 Nov to 18 Nov 2026" });
    expect(moves).toEqual([]);

    await pay(first.chargeId);
    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: first.chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: first.chargeId, now: FIFTH_NOV })).toEqual({ kind: "nothing" });

    expect(moves).toEqual([subscription.providerSubscriptionId]);
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", providerScheduledAt: FIFTH_NOV });
  });

  it("flags the payment for staff when the provider refuses, and leaves the add-on on", async () => {
    const subscription = await paidSubscription();
    const started = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await pay(started.chargeId);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const refusing = deps({ changeSubscriptionPlanAtPeriodEnd: async () => Promise.reject(new Error("Razorpay is down")) });
    expect(await finishAddOnAfterPayment(refusing, { businessId, chargeId: started.chargeId, now: FIFTH_NOV })).toEqual({ kind: "failed" });

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_add_on"))?.attentionReason).toBe("add_on_provider_pending");
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", providerScheduledAt: null });
  });

  it("flags the subscription's payment when the provider refuses an add too small to charge, since it has no payment of its own", async () => {
    const subscription = await paidSubscription();
    await open(addition(subscription, { netCents: 50, chargeCents: 0 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const refusing = deps({ changeSubscriptionPlanAtPeriodEnd: async () => Promise.reject(new Error("Razorpay is down")) });
    expect(await moveBasketAtProvider(refusing, subscription.id, FIFTH_NOV)).toEqual({ kind: "failed" });

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_first"))?.attentionReason).toBe("add_on_provider_pending");
  });

  it("waits for the renewal in the last hour of the month", async () => {
    const subscription = await paidSubscription();
    const lastHalfHour = new Date((subscription.paidThroughAt ?? PAID_AT).getTime() - 30 * 60 * 1000);

    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: lastHalfHour })).toEqual({
      kind: "refused",
      assessment: { kind: "unavailable", reason: "renewal-due" },
    });
  });

  it("sends a bank-transfer client to staff", async () => {
    await paidSubscription();
    await dbs.owner.db.update(subscriptions).set({ provider: "manual" });

    expect(await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV })).toEqual({
      kind: "blocked",
      reason: "manual-billing",
    });
  });

  it("keeps an add-on that is ending at no charge and at list, since the package offer is gone, moving the provider back to the amount with it", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV })).toEqual({ kind: "kept" });

    expect(moves).toEqual([subscription.providerSubscriptionId, subscription.providerSubscriptionId]);
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", endRequestedAt: null, pendingOfferDiscountAmountCents: 0 });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
      bundledAddOnNetCents: 1_169_900,
      pendingBundledAddOnNetCents: 1_299_800,
      adCreditCents: 150_000,
    });
  });

  it("refuses an add-on already in the plan payment", async () => {
    await paidSubscription(bundleOf("digital-growth"));

    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV })).toEqual({
      kind: "refused",
      assessment: { kind: "blocked", reason: "already-added" },
    });
  });
});

describe("adding a service moves the basket to the package price", () => {
  let moves: string[];
  /** The net a month the provider's plan was made at, and the discount that came off it, for each move. */
  let plansMade: { readonly net: number; readonly discount: number }[];
  let provider: BillingProvider;

  function deps(): BasketDeps {
    return {
      staffDb: dbs.staff.db,
      provider,
      ensureDiscountPlan: (p, plan, discount, net) => {
        plansMade.push({ net, discount });
        return ensureDiscountPlanFor(dbs.staff.db, p, plan, discount, net);
      },
    };
  }

  /** Adds a service as the customer does: the charge, its payment, and the provider step after it. */
  async function addAndPay(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<void> {
    const started = await startAddOn(deps(), { businessId, addOn, staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await pay(started.chargeId, `fake_pay_${addOn}`);
    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: started.chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
  }

  async function lines(subscription: Subscription) {
    return (await rowsOf(subscription)).map((row) => [row.addOn, row.offerDiscountAmountCents, row.netAmountCents, row.pendingOfferDiscountAmountCents]);
  }

  beforeEach(() => {
    moves = [];
    plansMade = [];
    const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => FIFTH_NOV });
    provider = {
      ...real,
      changeSubscriptionPlanAtPeriodEnd: async (id) => {
        moves.push(id);
      },
    };
  });

  describe("every way a second or third service joins", () => {
    // [starting services, the one added, its list, its package discount, its price with the discount, what is charged now for
    //  the days left, the basket's monthly price from the next bill (GST included: what each renewal takes)]
    type Service = Parameters<typeof startAddOn>[1]["addOn"];
    const W: Service = "managed-website";
    const S: Service = "digital-growth";
    const E: Service = "local-seo-aeo";
    const INR: readonly (readonly [readonly Service[], Service, number, number, number, number, number])[] = [
      [[W], S, 999_900, 99_910, 899_990, 406_447, 1_169_900],
      [[W], E, 2_499_900, 249_910, 2_249_990, 1_016_125, 2_519_900],
      [[S], W, 299_900, 29_990, 269_910, 121_895, 1_169_900],
      [[S], E, 2_499_900, 249_910, 2_249_990, 1_016_125, 3_149_900],
      [[E], W, 299_900, 29_990, 269_910, 121_895, 2_519_900],
      [[E], S, 999_900, 99_990, 899_910, 406_411, 3_149_900],
      [[W, S], E, 2_499_900, 499_940, 1_999_960, 903_208, 3_039_800],
      [[W, E], S, 999_900, 199_980, 799_920, 361_254, 3_039_800],
      [[S, E], W, 299_900, 59_980, 239_920, 108_351, 3_039_800],
    ];
    const USD: typeof INR = [
      [[W], S, 15_000, 1_450, 13_550, 6_119, 19_400],
      [[W], E, 35_000, 3_450, 31_550, 14_248, 37_400],
      [[S], W, 6_500, 650, 5_850, 2_642, 19_400],
      [[S], E, 35_000, 3_500, 31_500, 14_226, 45_000],
      [[E], W, 6_500, 650, 5_850, 2_642, 37_400],
      [[E], S, 15_000, 1_500, 13_500, 6_097, 45_000],
      [[W, S], E, 35_000, 7_000, 28_000, 12_645, 45_200],
      [[W, E], S, 15_000, 3_000, 12_000, 5_419, 45_200],
      [[S, E], W, 6_500, 1_300, 5_200, 2_348, 45_200],
    ];

    it.each([...INR.map((row) => ["INR", ...row] as const), ...USD.map((row) => ["USD", ...row] as const)])(
      "%s: %j then %s joins at its package price, charged for the days left, and the basket moves with it",
      async (currency, starting, added, listCents, discountCents, netCents, chargeCents, basketCents) => {
        if (currency === "USD") {
          const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
          if (usd === null) throw new Error("No active USD services plan was seeded");
          managed = usd;
          await dbs.owner.db.update(businesses).set({ currency: "USD" });
        }
        const subscription = await paidSubscription(bundleOf(...starting));

        const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: added, providerName: "fake", now: FIFTH_NOV });
        expect(assessment).toMatchObject({ kind: "offer", line: { listCents, discountCents, netCents }, quote: { chargeCents, nextRenewalCents: basketCents } });
        await addAndPay(added);

        expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: basketCents });
        expect(plansMade).toEqual([{ net: basketCents, discount: 0 }]);
      },
    );
  });

  it("leaves the basket as it was when the provider refuses, writes no pending offers, and a second try puts it right", async () => {
    const subscription = await paidSubscription();
    const started = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await pay(started.chargeId, "fake_pay_digital-growth");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const refusing: BasketDeps = { ...deps(), provider: { ...provider, changeSubscriptionPlanAtPeriodEnd: async () => Promise.reject(new Error("Razorpay is down")) } };
    expect(await finishAddOnAfterPayment(refusing, { businessId, chargeId: started.chargeId, now: FIFTH_NOV })).toEqual({ kind: "failed" });

    expect((await rowsOf(subscription)).map((row) => [row.addOn, row.pendingOfferDiscountAmountCents, row.providerScheduledAt])).toEqual([
      ["managed-website", null, null],
      ["digital-growth", null, null],
    ]);

    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: started.chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
    expect(await lines(subscription)).toEqual([
      ["managed-website", 0, 299_900, 29_990],
      ["digital-growth", 99_910, 899_990, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_169_900 });
  });

  it("prices the website's new neighbour at 10% off, moves the website to it from the next bill, and adds no ad credit", async () => {
    const subscription = await paidSubscription();

    await addAndPay("digital-growth");

    expect(await lines(subscription)).toEqual([
      ["managed-website", 0, 299_900, 29_990],
      ["digital-growth", 99_910, 899_990, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
      bundledAddOnNetCents: 299_900,
      pendingBundledAddOnNetCents: 1_169_900,
      adCreditCents: 0,
    });
    expect(plansMade).toEqual([{ net: 1_169_900, discount: 0 }]);
    expect(moves).toEqual([subscription.providerSubscriptionId]);

    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: subscription.paidThroughAt ?? PAID_AT }));
    expect(await lines(subscription)).toEqual([
      ["managed-website", 29_990, 269_910, null],
      ["digital-growth", 99_910, 899_990, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_169_900, pendingBundledAddOnNetCents: null });
  });

  it("lets a Social Media and Ads client add the website later, at the package price", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));

    await addAndPay("managed-website");

    expect(await lines(subscription)).toEqual([
      ["digital-growth", 0, 999_900, 99_910],
      ["managed-website", 29_990, 269_910, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_169_900, adCreditCents: 0 });
  });

  it("moves a package of two to 20% off when the third service joins, and keeps the ad credit it has", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "local-seo-aeo", providerName: "fake", now: FIFTH_NOV });
    expect(assessment).toMatchObject({ kind: "offer", line: { discountCents: 499_940, netCents: 1_999_960 }, quote: { nextRenewalCents: 3_039_800 } });

    await addAndPay("local-seo-aeo");

    expect(await lines(subscription)).toEqual([
      ["managed-website", 29_990, 269_910, 59_980],
      ["digital-growth", 99_910, 899_990, 199_980],
      ["local-seo-aeo", 499_940, 1_999_960, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 3_039_800, adCreditCents: 150_000 });
    expect(plansMade).toEqual([{ net: 3_039_800, discount: 0 }]);
  });

  it("puts the 80 paise that round Website + SEO down on the SEO line already there, not on the website that joins", async () => {
    const subscription = await paidSubscription(bundleOf("local-seo-aeo"));

    await addAndPay("managed-website");

    expect(await lines(subscription)).toEqual([
      ["local-seo-aeo", 0, 2_499_900, 249_910],
      ["managed-website", 29_990, 269_910, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 2_499_900, pendingBundledAddOnNetCents: 2_519_900 });
    expect(plansMade).toEqual([{ net: 2_519_900, discount: 0 }]);
  });

  it("takes Website + Social to all three and back: renews at 30,398, then at 12,998 after SEO is dropped", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    await addAndPay("local-seo-aeo");
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 3_039_800 });
    expect(chargedAmountCents(3_039_800, 0)).toBe(3_039_800);

    // The renewal at that amount: every line is at the discount the three earn, the leftover on the dearest.
    const renewedAt = subscription.paidThroughAt ?? PAID_AT;
    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: renewedAt }));
    expect(await lines(subscription)).toEqual([
      ["managed-website", 59_980, 239_920, null],
      ["digital-growth", 199_980, 799_920, null],
      ["local-seo-aeo", 499_940, 1_999_960, null],
    ]);

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: new Date("2026-11-25T06:00:00.000Z") })).toMatchObject({ kind: "scheduled" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_299_800, adCreditCents: 150_000 });
    expect(chargedAmountCents(299_900 + 999_900, 0)).toBe(1_299_800);
    expect(plansMade.at(-1)).toEqual({ net: 1_299_800, discount: 0 });
  });

  it("cannot turn on a Social Media and Ads charge left unpaid while another service was added and paid: it was quoted for the old basket", async () => {
    const subscription = await paidSubscription();
    const abandoned = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    if (abandoned.kind !== "pay") throw new Error(`Expected a charge, got ${abandoned.kind}`);

    await addAndPay("local-seo-aeo");
    const late = await pay(abandoned.chargeId, "fake_pay_abandoned");

    // The charge was waived when the other service was added, so the money is flagged for a refund and buys nothing.
    expect(late.outcome).toBe("not-open");
    expect(late.payment.attentionReason).toBe("already_paid");
    expect(await statusesOf(subscription, "digital-growth")).toEqual(["removed"]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 2_519_900 });
    expect(await lines(subscription)).toContainEqual(["local-seo-aeo", 249_910, 2_249_990, null]);
  });

  it("charges list to a business that has given the offer up, and moves nothing", async () => {
    const subscription = await paidSubscription();
    await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, PAID_AT));

    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV });
    expect(assessment).toMatchObject({
      kind: "offer",
      line: { discountCents: 0, netCents: 999_900 },
      quote: { netCents: 451_568, nextRenewalCents: 1_299_800 },
    });
    await addAndPay("digital-growth");

    expect(await lines(subscription)).toEqual([
      ["managed-website", 0, 299_900, null],
      ["digital-growth", 0, 999_900, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_299_800 });
  });

  it("prices a dollar business the same way, with no tax", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    if (usd === null) throw new Error("No active USD services plan was seeded");
    managed = usd;
    await dbs.owner.db.update(businesses).set({ currency: "USD" });
    const subscription = await paidSubscription();

    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV });
    expect(assessment).toMatchObject({ kind: "offer", line: { netCents: 13_550 }, quote: { netCents: 6_119, chargeCents: 6_119, nextRenewalCents: 19_400 } });
    await addAndPay("digital-growth");

    expect(await lines(subscription)).toEqual([
      ["managed-website", 0, 6_500, 650],
      ["digital-growth", 1_450, 13_550, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 19_400 });
  });

  describe("a service with a referral code", () => {
    /** A website bought on a code: ₹300 off, or 10% (₹299.90 off the ₹2,999), for the months given (no limit when null). */
    async function codedWebsite(kind: "amount" | "percent", discountMonths: number | null = null): Promise<Subscription> {
      await dbs.owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
      const code = await createReferralCode(dbs.staff.db, {
        code: "GAURAV",
        currency: "INR",
        affiliateId: null,
        discount: kind === "amount" ? { kind: "amount", amountCents: 30_000 } : { kind: "percent", basisPoints: 1_000 },
        discountMonths,
        expiresAt: null,
        maxRedemptions: null,
        createdByStaffId: "staff-code",
      });
      return paidSubscription(bundleOf("managed-website"), {
        referralCodeId: code.id,
        discountAmountCents: kind === "amount" ? 30_000 : 29_990,
        ...(discountMonths === null ? {} : { discountMonthsLeft: discountMonths }),
      });
    }

    it("keeps an amount code when a second service is added: the provider's plan is the new net less the same amount", async () => {
      const subscription = await codedWebsite("amount");
      const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV });
      // The pair costs 11,699; less the 300 the code takes.
      expect(assessment).toMatchObject({ kind: "offer", quote: { nextRenewalCents: 1_139_900 } });

      await addAndPay("digital-growth");

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
        discountAmountCents: 30_000,
        nextDiscountAmountCents: null,
        pendingBundledAddOnNetCents: 1_169_900,
      });
      expect(plansMade).toEqual([{ net: 1_169_900, discount: 30_000 }]);
    });

    it("reprices a percentage code on the new basket's package net, for the next renewal", async () => {
      const subscription = await codedWebsite("percent");

      await addAndPay("digital-growth");

      // 10% of 11,699 is 1,169.90; the subscription keeps taking its 299.90 until the renewal at the new amount.
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
        discountAmountCents: 29_990,
        nextDiscountAmountCents: 116_990,
        pendingBundledAddOnNetCents: 1_169_900,
      });
      expect(plansMade).toEqual([{ net: 1_169_900, discount: 116_990 }]);
    });

    it("reprices again on a third service, from the code and not from the last repricing", async () => {
      const subscription = await codedWebsite("percent");
      await addAndPay("digital-growth");

      await addAndPay("local-seo-aeo");

      // The three cost 30,398 at 20% off; 10% of that.
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ nextDiscountAmountCents: 303_980, pendingBundledAddOnNetCents: 3_039_800 });
      expect(plansMade.at(-1)).toEqual({ net: 3_039_800, discount: 303_980 });
    });

    /** The renewal at the amount the change moved the provider to: it takes the waiting discount as its own and finishes the change. */
    async function renewAtNewAmount(subscription: Subscription, providerPaymentId: string): Promise<void> {
      const waiting = (await findSubscriptionById(dbs.staff.db, subscription.id)) ?? subscription;
      const renewedAt = waiting.paidThroughAt ?? PAID_AT;
      const net = waiting.pendingBundledAddOnNetCents ?? waiting.bundledAddOnNetCents;
      const discount = waiting.nextDiscountAmountCents ?? waiting.discountAmountCents;
      await dbs.staff.db.transaction(async (tx) => {
        await activateRenewalPayment(tx, {
          businessId,
          subscriptionId: subscription.id,
          commitmentEndsAt: waiting.commitmentEndsAt ?? renewedAt,
          provider: "fake",
          providerPaymentId,
          amountCents: chargedAmountCents(net, discount),
          currency: "INR",
          paidAt: renewedAt,
          paidThroughAt: new Date(renewedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          periodStart: renewedAt,
          invoicedPrice: {
            plan: managed,
            bundledAddOns: renewalBundledLines(await rowsOf(subscription), true),
            netAmountCents: managed.recurringAmountCents,
            discountAmountCents: discount,
            retentionDiscountCents: 0,
          },
          atNewDiscount: discount !== waiting.discountAmountCents,
        });
        await completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: renewedAt });
      });
    }

    it("takes the discount off a drop as well: a percentage code follows the smaller basket", async () => {
      const subscription = await codedWebsite("percent");
      await addAndPay("digital-growth");
      await renewAtNewAmount(subscription, "fake_pay_renewal_two");
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountAmountCents: 116_990, nextDiscountAmountCents: null });

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: new Date("2026-11-25T06:00:00.000Z") })).toMatchObject({ kind: "scheduled" });

      // The website alone, at list: 10% of 2,999.
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountAmountCents: 116_990, nextDiscountAmountCents: 29_990, pendingBundledAddOnNetCents: 299_900 });
      expect(plansMade.at(-1)).toEqual({ net: 299_900, discount: 29_990 });
    });

    it("keeps an amount code through a drop, and records nothing waiting", async () => {
      const subscription = await codedWebsite("amount");
      await addAndPay("digital-growth");
      await renewAtNewAmount(subscription, "fake_pay_renewal_two");

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: new Date("2026-11-25T06:00:00.000Z") })).toMatchObject({ kind: "scheduled" });

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountAmountCents: 30_000, nextDiscountAmountCents: null });
      expect(plansMade.at(-1)).toEqual({ net: 299_900, discount: 30_000 });
    });

    it("keeps a code with its months through a change: the months are counted by payments, not by changes", async () => {
      const subscription = await codedWebsite("percent", 3);
      // The first payment took one of the three months.
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountMonthsLeft: 2 });

      await addAndPay("digital-growth");

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountMonthsLeft: 2, nextDiscountAmountCents: 116_990 });
    });

    it("takes nothing off a change once the code's months have run out", async () => {
      const subscription = await codedWebsite("percent", 1);
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 });

      await addAndPay("digital-growth");

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ discountAmountCents: 29_990, nextDiscountAmountCents: 0 });
      expect(plansMade).toEqual([{ net: 1_169_900, discount: 0 }]);
    });
  });

  describe("the renewal at the new amount", () => {
    it("is invoiced line by line at the package price it is charged at, to the paisa", async () => {
      const subscription = await paidSubscription();
      await addAndPay("digital-growth");
      const renewedAt = subscription.paidThroughAt ?? PAID_AT;
      const charged = chargedAmountCents(1_169_900, 0);
      const current = (await findSubscriptionById(dbs.staff.db, subscription.id)) ?? subscription;

      const renewal = await dbs.staff.db.transaction(async (tx) => {
        const recorded = await activateRenewalPayment(tx, {
          businessId,
          subscriptionId: subscription.id,
          commitmentEndsAt: current.commitmentEndsAt ?? renewedAt,
          provider: "fake",
          providerPaymentId: "fake_pay_renewal",
          amountCents: charged,
          currency: "INR",
          paidAt: renewedAt,
          paidThroughAt: new Date("2026-12-19T00:00:00.000Z"),
          periodStart: renewedAt,
          invoicedPrice: {
            plan: managed,
            bundledAddOns: renewalBundledLines(await rowsOf(subscription), true),
            netAmountCents: managed.recurringAmountCents,
            discountAmountCents: 0,
            retentionDiscountCents: 0,
          },
        });
        await completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: renewedAt });
        return recorded;
      });

      const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
      expect(charged).toBe(1_169_900);
      expect(invoice?.totalCents).toBe(charged);
      expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
        ["Managed Website", 299_900, 29_990],
        ["Social Media and Ads", 999_900, 99_910],
      ]);
    });

    it("is invoiced at what the amount billed now was made of when the provider has not moved: the new line is not in it yet", async () => {
      const subscription = await paidSubscription();
      await addAndPay("digital-growth");

      expect(renewalBundledLines(await rowsOf(subscription), false).map((row) => [row.addOn, row.offerDiscountAmountCents])).toEqual([["managed-website", 0]]);
    });
  });
});

describe("dropping a service ends the package offer for good", () => {
  let moves: string[];
  let plansMade: { readonly net: number; readonly discount: number }[];
  let provider: BillingProvider;

  function deps(overrides: Partial<BillingProvider> = {}): BasketDeps {
    return {
      staffDb: dbs.staff.db,
      provider: { ...provider, ...overrides },
      ensureDiscountPlan: (p, plan, discount, net) => {
        plansMade.push({ net, discount });
        return ensureDiscountPlanFor(dbs.staff.db, p, plan, discount, net);
      },
    };
  }

  /** Each line as [offer discount, net, pending discount], by service. */
  async function linesOf(subscription: Subscription) {
    return Object.fromEntries(
      (await rowsOf(subscription))
        .filter((row) => row.status !== "removed")
        .map((row) => [row.addOn, [row.offerDiscountAmountCents, row.netAmountCents, row.pendingOfferDiscountAmountCents]]),
    );
  }

  async function forfeitedAt(): Promise<Date | null> {
    // Each test's database holds one business.
    const rows = await dbs.owner.db.select({ at: businesses.packageOfferForfeitedAt }).from(businesses);
    return rows[0]?.at ?? null;
  }

  beforeEach(() => {
    moves = [];
    plansMade = [];
    const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => FIFTH_NOV });
    provider = {
      ...real,
      changeSubscriptionPlanAtPeriodEnd: async (id) => {
        moves.push(id);
      },
    };
  });

  describe("from all three services", () => {
    async function allThree(): Promise<Subscription> {
      return paidSubscription(bundleOf("managed-website", "digital-growth", "local-seo-aeo"), { adCreditCents: 300_000 });
    }

    it("forfeits the business, keeps the ad credit to the end of the paid month, puts the services kept at list from the next bill and tells the provider that amount", async () => {
      const subscription = await allThree();

      const removal = await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });

      expect(removal).toEqual({ kind: "scheduled", endsOn: subscription.paidThroughAt });
      expect(await forfeitedAt()).toEqual(FIFTH_NOV);
      expect(await linesOf(subscription)).toEqual({
        "managed-website": [59_980, 239_920, 0],
        "digital-growth": [199_980, 799_920, 0],
        "local-seo-aeo": [499_940, 1_999_960, null],
      });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
        bundledAddOnNetCents: 3_039_800,
        pendingBundledAddOnNetCents: 1_299_800,
        adCreditCents: 300_000,
      });
      expect(plansMade).toEqual([{ net: 1_299_800, discount: 0 }]);
      expect(moves).toEqual([subscription.providerSubscriptionId]);
    });

    it("renews at 1299800, invoiced line by line at list, and then the dropped line is gone", async () => {
      const subscription = await allThree();
      await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });
      const renewedAt = subscription.paidThroughAt ?? PAID_AT;
      const charged = chargedAmountCents(1_299_800, 0);
      const current = (await findSubscriptionById(dbs.staff.db, subscription.id)) ?? subscription;

      const renewal = await dbs.staff.db.transaction(async (tx) => {
        const recorded = await activateRenewalPayment(tx, {
          businessId,
          subscriptionId: subscription.id,
          commitmentEndsAt: current.commitmentEndsAt ?? renewedAt,
          provider: "fake",
          providerPaymentId: "fake_pay_renewal",
          amountCents: charged,
          currency: "INR",
          paidAt: renewedAt,
          paidThroughAt: new Date("2026-12-19T00:00:00.000Z"),
          periodStart: renewedAt,
          invoicedPrice: {
            plan: managed,
            bundledAddOns: renewalBundledLines(await rowsOf(subscription), true),
            netAmountCents: managed.recurringAmountCents,
            discountAmountCents: 0,
            retentionDiscountCents: 0,
          },
        });
        await completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: renewedAt });
        return recorded;
      });

      const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
      expect(charged).toBe(1_299_800);
      expect(invoice?.totalCents).toBe(charged);
      expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
        ["Managed Website", 299_900, 0],
        ["Social Media and Ads", 999_900, 0],
      ]);
      expect(await linesOf(subscription)).toEqual({ "managed-website": [0, 299_900, null], "digital-growth": [0, 999_900, null] });
      expect(await statusesOf(subscription, "local-seo-aeo")).toEqual(["removed"]);
      // The renewal that takes the dropped line off is the first month without the package: the ad credit stops.
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_299_800, pendingBundledAddOnNetCents: null, adCreditCents: 0 });
    });
  });

  it("waives a charge for a service that was still waiting to be paid, so it cannot arrive at a price the offer no longer gives", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    const started = await startAddOn(deps(), { businessId, addOn: "local-seo-aeo", staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);

    await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV });

    expect(await statusesOf(subscription, "local-seo-aeo")).toEqual(["removed"]);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, started.chargeId)).toMatchObject({ status: "waived" });
  });

  it("lets the website go while another service stays: the one kept is at list from the next bill", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "managed-website", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    expect(await linesOf(subscription)).toEqual({ "managed-website": [29_990, 269_910, null], "digital-growth": [99_910, 899_990, 0] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 999_900, adCreditCents: 150_000 });
    expect(await forfeitedAt()).toEqual(FIFTH_NOV);
    expect(plansMade).toEqual([{ net: 999_900, discount: 0 }]);
  });

  it("leaves a two-service package with the website at list, the offer gone and no ad credit", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });

    await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV });

    expect(await linesOf(subscription)).toMatchObject({ "managed-website": [29_990, 269_910, 0] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 299_900, adCreditCents: 150_000 });
    expect(await forfeitedAt()).toEqual(FIFTH_NOV);
    expect(plansMade).toEqual([{ net: 299_900, discount: 0 }]);
  });

  it("does the same in dollars", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    if (usd === null) throw new Error("No active USD services plan was seeded");
    managed = usd;
    await dbs.owner.db.update(businesses).set({ currency: "USD" });
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 2_500 });

    await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV });

    expect(await linesOf(subscription)).toMatchObject({ "managed-website": [650, 5_850, 0] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 6_500, adCreditCents: 2_500 });
  });

  it("changes nothing more for a business that had already given the offer up", async () => {
    const lines = bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], managed.currency, true).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: managed.taxRateBasisPoints,
    }));
    const subscription = await paidSubscription(lines);
    const EARLIER = new Date("2026-10-25T00:00:00.000Z");
    await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, EARLIER));

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    expect(await forfeitedAt()).toEqual(EARLIER);
    expect(await linesOf(subscription)).toMatchObject({ "managed-website": [0, 299_900, null], "digital-growth": [0, 999_900, null] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 1_299_800, adCreditCents: 0 });
  });

  it("counts a service added this month, not yet billed, among those that stay", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    const started = await startAddOn(deps(), { businessId, addOn: "local-seo-aeo", staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await pay(started.chargeId, "fake_pay_seo");
    expect(await rowFor(subscription, "local-seo-aeo")).toMatchObject({ status: "active", billedFrom: null });

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 2_799_800, adCreditCents: 150_000 });
    expect(plansMade).toEqual([{ net: 2_799_800, discount: 0 }]);
    expect(await linesOf(subscription)).toMatchObject({ "managed-website": [29_990, 269_910, 0], "local-seo-aeo": [499_940, 1_999_960, 0] });
  });

  it("keeps the ad credit of a business that had already given the offer up until the renewal that takes the line off", async () => {
    const lines = bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], managed.currency, true).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: managed.taxRateBasisPoints,
    }));
    const subscription = await paidSubscription(lines, { adCreditCents: 300_000 });
    const EARLIER = new Date("2026-10-25T00:00:00.000Z");
    await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, EARLIER));

    await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });

    expect(await forfeitedAt()).toEqual(EARLIER);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 300_000, pendingBundledAddOnNetCents: 1_299_800 });

    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: subscription.paidThroughAt ?? PAID_AT }));

    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 0 });
  });

  it("drops one of three services in dollars: the two that stay go to list, and the ad credit runs on", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    if (usd === null) throw new Error("No active USD services plan was seeded");
    managed = usd;
    await dbs.owner.db.update(businesses).set({ currency: "USD" });
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth", "local-seo-aeo"), { adCreditCents: 6_000 });

    await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });

    expect(await linesOf(subscription)).toMatchObject({ "managed-website": [1_300, 5_200, 0], "digital-growth": [3_000, 12_000, 0], "local-seo-aeo": [7_000, 28_000, null] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 21_500, adCreditCents: 6_000 });
    expect(plansMade).toEqual([{ net: 21_500, discount: 0 }]);
  });

  describe("from a single service", () => {
    it("is refused, and nothing changes: no ad credit lost, no offer forfeited, the provider not asked", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"), { adCreditCents: 200_000 });

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toEqual({ kind: "last-service" });

      expect(await forfeitedAt()).toBeNull();
      expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", endRequestedAt: null, pendingOfferDiscountAmountCents: null });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 200_000, pendingBundledAddOnNetCents: null });
      expect(moves).toEqual([]);
    });

    it("is refused for the website too", async () => {
      await paidSubscription();

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "managed-website", now: FIFTH_NOV })).toEqual({ kind: "last-service" });
    });

    it("is refused when the other service is already on its way out", async () => {
      const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"));
      await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV });

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "managed-website", now: FIFTH_NOV })).toEqual({ kind: "last-service" });
      expect(await rowFor(subscription, "managed-website")).toMatchObject({ endRequestedAt: null });
    });
  });

  it("is refused while the account has asked to close: nothing changes and the provider is not asked", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    await dbs.owner.db.update(subscriptions).set({ cancelRequestedAt: FIFTH_NOV });

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toEqual({ kind: "cancel-requested" });

    expect(await forfeitedAt()).toBeNull();
    expect(await linesOf(subscription)).toEqual({ "managed-website": [29_990, 269_910, null], "digital-growth": [99_910, 899_990, null] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 150_000, pendingBundledAddOnNetCents: null });
    expect(moves).toEqual([]);
  });

  it("is refused, like an add and a keep, while a kept plan waits to start: the old plan is cancelled at the provider, so nothing changes and the provider is not asked", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth", "local-seo-aeo"), { adCreditCents: 300_000 });
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
    // The client cancelled, then chose Keep my plan, and the provider holds the new mandate: it starts where the paid month ends.
    await dbs.owner.db.update(subscriptions).set({ cancelRequestedAt: FIFTH_NOV });
    const old = await findSubscriptionById(dbs.staff.db, subscription.id);
    if (old === null) throw new Error("The plan was not recorded");
    const successor = await openKeptSubscription(dbs.staff.db, {
      continues: old,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"b".repeat(24)}`,
      bundledAddOns: bundleOf("managed-website", "local-seo-aeo"),
      adCreditCents: 300_000,
      replacing: null,
      now: FIFTH_NOV,
    });
    const before = await linesOf(subscription);
    const startsOn = subscription.paidThroughAt;

    // Until the mandate is authorised the account is still closing, and says so.
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toEqual({ kind: "cancel-requested" });

    await confirmKeptSubscription(dbs.staff.db, { subscriptionId: successor.id, now: FIFTH_NOV });

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toEqual({ kind: "plan-kept", startsOn });
    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV })).toEqual({
      kind: "refused",
      assessment: { kind: "plan-kept", startsOn },
    });
    expect(await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV })).toEqual({ kind: "plan-kept", startsOn });
    expect(await linesOf(subscription)).toEqual(before);
    expect(moves).toHaveLength(1);
  });

  it("changes nothing when the provider refuses: the offer, the ad credit and the lines stay", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });

    const refusing = deps({ changeSubscriptionPlanAtPeriodEnd: async () => Promise.reject(new Error("Razorpay is down")) });
    expect(await removeBundledAddOn(refusing, { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toEqual({ kind: "failed" });

    expect(await forfeitedAt()).toBeNull();
    expect(await linesOf(subscription)).toEqual({ "managed-website": [29_990, 269_910, null], "digital-growth": [99_910, 899_990, null] });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 150_000, pendingBundledAddOnNetCents: null });
  });
});

describe("a basket that changes while the provider is being told", () => {
  let plansMade: { readonly net: number; readonly discount: number }[];
  let provider: BillingProvider;
  /** Runs once, inside the next provider call, when set: another customer action landing in the window. */
  let during: (() => Promise<void>) | null;

  function deps(overrides: Partial<BillingProvider> = {}): BasketDeps {
    return {
      staffDb: dbs.staff.db,
      provider: { ...provider, ...overrides },
      ensureDiscountPlan: (p, plan, discount, net) => {
        plansMade.push({ net, discount });
        return ensureDiscountPlanFor(dbs.staff.db, p, plan, discount, net);
      },
    };
  }

  async function paidAdd(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<string> {
    const started = await startAddOn(deps(), { businessId, addOn, staffId: null, now: FIFTH_NOV });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await pay(started.chargeId, `fake_pay_${addOn}`);
    return started.chargeId;
  }

  async function firstPaymentFlag(): Promise<string | null> {
    return (await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_first"))?.attentionReason ?? null;
  }

  async function staying(subscription: Subscription): Promise<readonly BundledAddOn[]> {
    return (await rowsOf(subscription)).filter((row) => row.status === "active" && row.endRequestedAt === null);
  }

  beforeEach(() => {
    plansMade = [];
    during = null;
    const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => FIFTH_NOV });
    provider = {
      ...real,
      changeSubscriptionPlanAtPeriodEnd: async () => {
        const hook = during;
        during = null;
        await hook?.();
      },
    };
  });

  it("ends a forfeited two-service business with exactly one service when both are removed at once, and puts the provider on that one", async () => {
    const forfeitedLines = bundleLines(["managed-website", "digital-growth"], managed.currency, true).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: managed.taxRateBasisPoints,
    }));
    const subscription = await paidSubscription(forfeitedLines);
    await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, PAID_AT));
    // Both removals read the basket and reach the provider before either records anything.
    let arrived = 0;
    let release: () => void = () => undefined;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated = deps({
      changeSubscriptionPlanAtPeriodEnd: async () => {
        arrived += 1;
        if (arrived === 2) release();
        await bothArrived;
      },
    });

    const results = await Promise.all([
      removeBundledAddOn(gated, { businessId, addOn: "managed-website", now: FIFTH_NOV }),
      removeBundledAddOn(gated, { businessId, addOn: "digital-growth", now: FIFTH_NOV }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["failed", "scheduled"]);
    const left = await staying(subscription);
    expect(left).toHaveLength(1);
    const remaining = left[0]?.listAmountCents ?? 0;
    expect(plansMade.at(-1)).toEqual({ net: remaining, discount: 0 });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: remaining });
    expect(await firstPaymentFlag()).toBe("add_on_provider_pending");
  });

  it.each([["recordBundledAddOnRemoval", recordBundledAddOnRemoval], ["endPackageOffer", endPackageOffer]])(
    "leaves the basket as it was when %s throws after the provider was moved, flags staff, and a second try goes through",
    async (_name, write) => {
      const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
      vi.mocked(write).mockRejectedValueOnce(new Error("connection lost"));

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toEqual({ kind: "failed" });

      expect(await rowFor(subscription, "digital-growth")).toMatchObject({ endRequestedAt: null });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 150_000, pendingBundledAddOnNetCents: null });
      expect((await dbs.owner.db.select({ at: businesses.packageOfferForfeitedAt }).from(businesses))[0]?.at).toBeNull();
      expect(await firstPaymentFlag()).toBe("add_on_provider_pending");

      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 150_000, pendingBundledAddOnNetCents: 299_900 });
      expect((await dbs.owner.db.select({ at: businesses.packageOfferForfeitedAt }).from(businesses))[0]?.at).toEqual(FIFTH_NOV);
    },
  );

  it("fails a removal when a paid add lands while the provider is being told, puts the provider on the basket as it now is, and a second try prices the new basket", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth"), { adCreditCents: 150_000 });
    during = async () => {
      await paidAdd("local-seo-aeo");
    };

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toEqual({ kind: "failed" });

    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ endRequestedAt: null });
    expect(plansMade.at(-1)).toEqual({ net: 3_039_800, discount: 0 });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ adCreditCents: 150_000 });
    expect(await firstPaymentFlag()).toBe("add_on_provider_pending");

    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
    expect(plansMade.at(-1)).toEqual({ net: 2_799_800, discount: 0 });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 2_799_800 });
  });

  it("fails the provider step after an add when a removal lands in the window, leaves the basket to the removal, and a second try schedules it", async () => {
    const subscription = await paidSubscription();
    const chargeId = await paidAdd("digital-growth");
    during = async () => {
      expect(await removeBundledAddOn(deps(), { businessId, addOn: "managed-website", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
    };

    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId, now: FIFTH_NOV })).toEqual({ kind: "failed" });

    expect(plansMade.at(-1)).toEqual({ net: 999_900, discount: 0 });
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ providerScheduledAt: null, pendingOfferDiscountAmountCents: 0 });
    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_digital-growth"))?.attentionReason).toBe("add_on_provider_pending");

    expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ providerScheduledAt: FIFTH_NOV });
  });

  it("fails keeping a service when another is removed in the window, and puts the provider on what is left", async () => {
    const subscription = await paidSubscription(bundleOf("managed-website", "digital-growth", "local-seo-aeo"), { adCreditCents: 300_000 });
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
    during = async () => {
      expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });
    };

    expect(await startAddOn(deps(), { businessId, addOn: "local-seo-aeo", staffId: null, now: FIFTH_NOV })).toEqual({ kind: "changed" });

    expect(await rowFor(subscription, "local-seo-aeo")).toMatchObject({ endRequestedAt: FIFTH_NOV });
    expect(plansMade.at(-1)).toEqual({ net: 299_900, discount: 0 });
    expect(await firstPaymentFlag()).toBe("add_on_provider_pending");
  });
});
