import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BundledAddOnNotPossibleError,
  bundledAddOns,
  bundledNetAfterRemoving,
  businesses,
  completeBundledAddOnChanges,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findChargeForBusiness,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  keepBundledAddOn,
  markBundledAddOnsScheduled,
  openBundledAddOn,
  openCheckoutSubscription,
  recordBundledAddOnRemoval,
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
import { activateFirstPayment } from "./server/billing-activation";
import {
  addOnChargeDescription,
  finishAddOnAfterPayment,
  readAddOnAssessment,
  removeBundledAddOn,
  startAddOn,
  type BasketDeps,
} from "./server/basket-change";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
import { ensureDiscountPlanFor } from "./server/discount-plans";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

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

/** A Managed Website subscription, paid on 19 Oct with the given add-ons, as it now stands. */
async function paidSubscription(bundled: readonly NewBundledAddOn[] = []): Promise<Subscription> {
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: managed.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
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
      discountAmountCents: 0,
    }),
  );
  const paid = await findSubscriptionById(dbs.staff.db, subscription.id);
  if (paid?.paidThroughAt == null) throw new Error("The first payment left nothing paid through");
  return paid;
}

/** Digital Growth added on 5 Nov at the worked example's quote, unless told otherwise. */
function addition(subscription: Subscription, overrides: Partial<NewAddedAddOn> = {}): NewAddedAddOn {
  return {
    businessId,
    subscriptionId: subscription.id,
    addOn: "digital-growth",
    listAmountCents: 700_000,
    taxRateBasisPoints: 1_800,
    currency: "INR",
    netCents: 316_129,
    chargeCents: 373_032,
    quotedPeriodEnd: subscription.paidThroughAt ?? PAID_AT,
    description: "Digital Growth, 05 Nov to 18 Nov 2026",
    staffId: null,
    now: FIFTH_NOV,
    ...overrides,
  };
}

function open(input: NewAddedAddOn) {
  return dbs.staff.db.transaction((tx) => openBundledAddOn(tx, input));
}

function pay(chargeId: string, providerPaymentId = "fake_pay_add_on", amountCents = 373_032) {
  return dbs.staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, {
      chargeId,
      businessId,
      provider: "fake",
      providerPaymentId,
      amountCents,
      currency: "INR",
      paidAt: FIFTH_NOV,
      now: FIFTH_NOV,
    }),
  );
}

async function rowsOf(subscription: Subscription): Promise<readonly BundledAddOn[]> {
  return findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
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
  if (plan === null) throw new Error("No active INR Managed Website plan was seeded");
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
    const again = { businessId, subscriptionId: subscription.id, addOn: "digital-growth", listAmountCents: 700_000, netAmountCents: 700_000, taxRateBasisPoints: 1_800 };

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
    expect(charge).toMatchObject({ kind: "add_on", status: "open", unitAmountCents: 316_129, amountCents: 373_032, quantity: 1, description: "Digital Growth, 05 Nov to 18 Nov 2026" });
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({
      status: "pending",
      chargeId: opened.chargeId,
      listAmountCents: 700_000,
      offerDiscountAmountCents: 0,
      netAmountCents: 700_000,
      quotedPeriodEnd: subscription.paidThroughAt,
      billedFrom: null,
    });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 0, pendingBundledAddOnNetCents: null });
  });

  it("replaces an earlier open charge for the same add-on", async () => {
    const subscription = await paidSubscription();
    const first = await open(addition(subscription));

    const second = await open(addition(subscription, { netCents: 293_548, chargeCents: 346_387 }));

    expect(second.chargeId).not.toBe(first.chargeId);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, first.chargeId ?? "")).toMatchObject({ status: "waived" });
    expect((await rowsOf(subscription)).map((row) => row.status)).toEqual(["removed", "pending"]);
  });

  it("turns the add-on on when its charge is paid, invoices the charge, and carries the higher amount the renewal must arrive at", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));

    const recorded = await pay(opened.chargeId ?? "");

    expect(recorded.outcome).toBe("paid");
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", activatedAt: FIFTH_NOV, billedFrom: null });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 0, pendingBundledAddOnNetCents: 700_000 });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
    expect(invoice?.totalCents).toBe(373_032);
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Digital Growth, 05 Nov to 18 Nov 2026"]);
  });

  it("applies nothing for a charge paid after the month renewed, and keeps the money for a refund", async () => {
    const subscription = await paidSubscription();
    const opened = await open(addition(subscription));
    await dbs.owner.db.update(subscriptions).set({ paidThroughAt: new Date("2026-12-19T00:00:00.000Z") });

    const recorded = await pay(opened.chargeId ?? "");

    expect(recorded.outcome).toBe("add-on-not-applied");
    expect(recorded.payment.attentionReason).toBe("add_on_not_applied");
    expect((await rowsOf(subscription)).map((row) => row.status)).toEqual(["removed"]);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, opened.chargeId ?? "")).toMatchObject({ status: "waived" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: null });
  });

  it("drops the waiting add-on when staff waive its charge", async () => {
    const subscription = await paidSubscription();
    await dbs.owner.db.insert(users).values({ id: "staff-add", name: "Staff", email: "staff-add@example.test", emailVerified: true });
    const opened = await open(addition(subscription));

    await waiveCharge(dbs.staff.db, { chargeId: opened.chargeId ?? "", businessId, staffId: "staff-add", now: FIFTH_NOV });

    expect((await rowsOf(subscription)).map((row) => row.status)).toEqual(["removed"]);
  });

  it("turns the add-on on at once when its share is too small to charge", async () => {
    const subscription = await paidSubscription();

    const opened = await open(addition(subscription, { netCents: 50, chargeCents: 0 }));

    expect(opened.chargeId).toBeNull();
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", activatedAt: FIFTH_NOV, chargeId: null, billedFrom: null });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 700_000 });
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

    const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_500_000, netCents: 1_129_032, chargeCents: 1_332_258 }));
    await pay(opened.chargeId ?? "", "fake_pay_seo", 1_332_258);

    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 665_000, pendingBundledAddOnNetCents: 2_500_000 });
  });

  it("counts an added add-on in what is left when another is taken out", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_500_000, netCents: 1_129_032, chargeCents: 1_332_258 }));
    await pay(opened.chargeId ?? "", "fake_pay_seo", 1_332_258);

    const rows = await rowsOf(subscription);
    expect(bundledNetAfterRemoving(rows, await rowFor(subscription, "digital-growth"))).toBe(2_500_000);
  });

  describe("keeping an add-on that was asked to stop", () => {
    it("clears the request, and the amount goes back to what is billed now", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"));
      const growth = await rowFor(subscription, "digital-growth");
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });

      expect(await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: FIFTH_NOV }))).toBe(true);

      expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", endRequestedAt: null });
      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 665_000, pendingBundledAddOnNetCents: null });
    });

    it("keeps the higher amount waiting when another add-on was added this month", async () => {
      const subscription = await paidSubscription(bundleOf("digital-growth"));
      const growth = await rowFor(subscription, "digital-growth");
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 0, now: FIFTH_NOV });
      const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_500_000, netCents: 1_129_032, chargeCents: 1_332_258 }));
      await pay(opened.chargeId ?? "", "fake_pay_seo", 1_332_258);

      await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: FIFTH_NOV }));

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ pendingBundledAddOnNetCents: 665_000 + 2_500_000 });
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
    const opened = await open(addition(subscription, { addOn: "local-seo-aeo", listAmountCents: 2_500_000, netCents: 1_129_032, chargeCents: 1_332_258 }));
    await pay(opened.chargeId ?? "", "fake_pay_seo", 1_332_258);

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
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 700_000, pendingBundledAddOnNetCents: null });
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

  it("quotes the worked example from the subscription's own month", async () => {
    await paidSubscription();

    const assessment = await readAddOnAssessment(dbs.staff.db, { businessId, addOn: "digital-growth", providerName: "fake", now: FIFTH_NOV });

    expect(assessment).toMatchObject({ kind: "offer", listCents: 700_000, quote: { daysLeft: 14, periodDays: 31, netCents: 316_129, chargeCents: 373_032, nextRenewalCents: 1_179_882 } });
    expect(addOnChargeDescription("digital-growth", FIFTH_NOV, new Date("2026-11-19T00:00:00.000Z"))).toBe("Digital Growth, 05 Nov to 18 Nov 2026");
  });

  it("opens one charge however often Add is pressed, and tells the provider once it is paid, once", async () => {
    const subscription = await paidSubscription();
    const first = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    const again = await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV });
    if (first.kind !== "pay") throw new Error(`Expected a charge, got ${first.kind}`);
    expect(again).toEqual(first);
    expect(await findChargeForBusiness(dbs.staff.db, businessId, first.chargeId)).toMatchObject({ amountCents: 373_032, description: "Digital Growth, 05 Nov to 18 Nov 2026" });
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

  it("keeps an add-on that is ending at no charge, moving the provider back to the amount with it", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "digital-growth", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV })).toEqual({ kind: "kept" });

    expect(moves).toEqual([subscription.providerSubscriptionId, subscription.providerSubscriptionId]);
    expect(await rowFor(subscription, "digital-growth")).toMatchObject({ status: "active", endRequestedAt: null });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 665_000, pendingBundledAddOnNetCents: null });
  });

  it("refuses an add-on already in the plan payment", async () => {
    await paidSubscription(bundleOf("digital-growth"));

    expect(await startAddOn(deps(), { businessId, addOn: "digital-growth", staffId: null, now: FIFTH_NOV })).toEqual({
      kind: "refused",
      assessment: { kind: "blocked", reason: "already-added" },
    });
  });
});
