import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bundledAddOns,
  businesses,
  findActivatedSuccessor,
  findBillingState,
  findBundledAddOnsForSubscription,
  findChargeForBusiness,
  findLiveBundledAddOns,
  listChargesForBusiness,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  findWaitingAddedServiceSuccessor,
  findWaitingSuccessor,
  openAddedServiceSuccessor,
  openCheckoutSubscription,
  openKeptSubscription,
  type NewBundledAddOn,
  type Plan,
  subscriptions,
  type Subscription,
} from "@brandbasket/db";
import { eq, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { createFakeBillingProvider, hasBillingAccess } from "@brandbasket/billing";
import { recordAddedServicePayment, startCombinedAddOn } from "./server/added-service";
import { activateFirstPayment } from "./server/billing-activation";

vi.mock("server-only", () => ({}));

/**
 * Adding a service after sign-up as one combined subscription (plan 63, Option Y), against a real database: the owner's example,
 * the Website bought on 1 Nov and Social Media on 11 Nov. The combined subscription is opened with its upfront charge, and once that
 * is paid it is the business's own: both services live, paid to 11 Dec, the offer running to then, the old subscription's lines ended.
 */

const PRICE = 299_900;
const NOV_1 = new Date("2026-11-01T06:00:00.000Z");
const DEC_1 = new Date("2026-12-01T06:00:00.000Z");
const NOV_11 = new Date("2026-11-11T06:00:00.000Z");
const DEC_11 = new Date("2026-12-11T06:00:00.000Z");
const UPFRONT = 96_842;

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

function line(addOn: string, trialPriceCents: number | null = null): NewBundledAddOn {
  return { addOn, listAmountCents: PRICE, offerDiscountAmountCents: 0, netAmountCents: PRICE, taxRateBasisPoints: plan.taxRateBasisPoints, trialPriceCents };
}

/** The Website (or the services given), bought and paid on 1 Nov. */
async function websiteSubscription(services: readonly string[] = ["managed-website"]): Promise<Subscription> {
  const opened = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns: services.map((service) => line(service)),
    adCreditCents: 0,
    replacing: null,
    now: NOV_1,
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: opened.id, plan, provider: "fake", providerPaymentId: "fake_pay_website", paidAt: NOV_1, discountAmountCents: 0 }),
  );
  const paid = await findSubscriptionById(dbs.staff.db, opened.id);
  if (paid === null) throw new Error("The website subscription was not saved");
  return paid;
}

function openCombined(current: Subscription, providerSubscriptionId = `fake_sub_${"b".repeat(24)}`, replacing: string | null = null) {
  return openAddedServiceSuccessor(dbs.staff.db, {
    continues: current,
    provider: "fake",
    providerSubscriptionId,
    bundledAddOns: [line("managed-website"), line("social-media", 100)],
    addOn: "social-media",
    discountAmountCents: 0,
    upfrontCents: UPFRONT,
    newBillingDate: DEC_11,
    replacing,
    now: NOV_11,
  });
}

function pay(subscriptionId: string, amountCents = UPFRONT, providerPaymentId = "fake_pay_upfront") {
  return dbs.staff.db.transaction((tx) =>
    recordAddedServicePayment(tx, { subscriptionId, provider: "fake", providerPaymentId, amountCents, currency: "INR", paidAt: NOV_11 }),
  );
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
  const found = (await dbs.owner.db.query.plans.findFirst({ where: (plans, { and, eq }) => and(eq(plans.currency, "INR"), eq(plans.active, true)) })) as Plan | undefined;
  if (found === undefined) throw new Error("No active INR plan was seeded");
  plan = found;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("opening the combined subscription", () => {
  it("is not a kept plan, and keeping the plan later drops it unpaid", async () => {
    const current = await websiteSubscription();
    const combined = await openCombined(current);
    expect(await findWaitingSuccessor(dbs.staff.db, current.id)).toBeNull();

    const kept = await openKeptSubscription(dbs.staff.db, {
      continues: current,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"k".repeat(24)}`,
      bundledAddOns: [line("managed-website")],
      adCreditCents: 0,
      replacing: null,
      now: NOV_11,
    });

    expect((await findWaitingSuccessor(dbs.staff.db, current.id))?.id).toBe(kept.id);
    expect((await findSubscriptionById(dbs.staff.db, combined.id))?.status).toBe("cancelled");
  });

  it("waits beside the Website's subscription, which stays the business's own until the upfront amount is paid", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);

    expect(subscription).toMatchObject({ status: "incomplete", continuesId: current.id, startAt: DEC_11, firstPaymentCents: UPFRONT, firstChargeAt: DEC_11, bundledAddOnNetCents: 2 * PRICE });
    expect((await findWaitingAddedServiceSuccessor(dbs.staff.db, current.id))?.id).toBe(subscription.id);
    const state = await findBillingState(dbs.staff.db, businessId);
    expect(state?.subscription?.id).toBe(current.id);
    // No charge yet: one is written only once the upfront payment is recorded, so nothing is left open to pay or waive another way.
    expect(await listChargesForBusiness(dbs.staff.db, businessId, { status: "open", limit: 10 })).toEqual([]);
    const lines = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(lines.map((row) => [row.addOn, row.status, row.trialPriceCents, row.chargeId])).toEqual([
      ["managed-website", "pending", null, null],
      ["social-media", "pending", 100, null],
    ]);
  });

  it("ends an earlier one that was never paid", async () => {
    const current = await websiteSubscription();
    const first = await openCombined(current);
    const second = await openCombined(current, `fake_sub_${"c".repeat(24)}`, first.id);

    expect((await findSubscriptionById(dbs.staff.db, first.id))?.status).toBe("cancelled");
    expect((await findWaitingAddedServiceSuccessor(dbs.staff.db, current.id))?.id).toBe(second.id);
  });
});

describe("paying the upfront amount", () => {
  it("makes the combined subscription the business's own: both services live, paid to 11 Dec, the offer running to then", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);

    const result = await pay(subscription.id);

    expect(result).toMatchObject({ kind: "recorded", businessId, replaced: { provider: "fake", subscriptionId: current.id } });
    const state = await findBillingState(dbs.staff.db, businessId);
    expect(state?.subscription).toMatchObject({ id: subscription.id, status: "active", paidThroughAt: DEC_11 });
    expect(hasBillingAccess(state?.subscription ?? null, NOV_11)).toBe(true);
    const live = await findLiveBundledAddOns(dbs.staff.db, businessId);
    expect(live.map((row) => [row.addOn, row.subscriptionId, row.trialEndsAt])).toEqual([
      ["managed-website", subscription.id, null],
      ["social-media", subscription.id, DEC_11],
    ]);
    expect(await findActivatedSuccessor(dbs.staff.db, current.id)).toMatchObject({ id: subscription.id });
    expect((await findSubscriptionById(dbs.staff.db, current.id))?.cancelRequestedAt).toEqual(NOV_11);
    const payment = await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_upfront");
    expect(payment).toMatchObject({ kind: "add_on", amountCents: UPFRONT, subscriptionId: subscription.id });
    const social = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((row) => row.addOn === "social-media");
    expect(await findChargeForBusiness(dbs.staff.db, businessId, social?.chargeId ?? "")).toMatchObject({
      kind: "add_on",
      status: "paid",
      paymentId: payment?.id,
      amountCents: UPFRONT,
      description: expect.stringMatching(/^Social Media Management first month offer, .+, and your plan .+$/),
    });
    expect((await findTaxInvoiceByPaymentId(dbs.staff.db, payment?.id ?? ""))?.totalCents).toBe(UPFRONT);
  });

  it("records it once however many times it is reported", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);
    await pay(subscription.id);
    expect(await pay(subscription.id)).toEqual({ kind: "already-recorded" });
  });

  it("keeps a payment of another amount for staff and changes nothing", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);
    const result = await pay(subscription.id, PRICE);
    expect(result).toMatchObject({ kind: "unapplied", reason: "amount_mismatch", newlyRecorded: true });
    expect((await findBillingState(dbs.staff.db, businessId))?.subscription?.id).toBe(current.id);
    expect((await findSubscriptionById(dbs.staff.db, current.id))?.cancelRequestedAt).toBeNull();
  });

  it("keeps money for a combined subscription that was replaced, for staff to refund", async () => {
    const current = await websiteSubscription();
    const first = await openCombined(current);
    await openCombined(current, `fake_sub_${"c".repeat(24)}`, first.id);
    expect(await pay(first.id)).toMatchObject({ kind: "unapplied", reason: "checkout_replaced" });
  });

  it("keeps money for staff when the plan it replaces renewed past the new billing date since it opened", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);

    // Renewed on 1 Dec, so paid to 1 Jan: the days up to 11 Dec the upfront amount covers would be taken twice.
    await dbs.owner.db.update(subscriptions).set({ paidThroughAt: new Date("2027-01-01T06:00:00.000Z") }).where(eq(subscriptions.id, current.id));
    expect(await pay(subscription.id)).toMatchObject({ kind: "unapplied", reason: "checkout_replaced" });
    expect((await findBillingState(dbs.staff.db, businessId))?.subscription?.id).toBe(current.id);
  });

  it("keeps money for staff when a service on the plan it replaces has been asked to stop", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);
    const [website] = await findBundledAddOnsForSubscription(dbs.staff.db, current.id);
    await dbs.owner.db.update(bundledAddOns).set({ endRequestedAt: NOV_11 }).where(eq(bundledAddOns.id, website?.id ?? ""));
    expect(await pay(subscription.id, UPFRONT, "fake_pay_stopped")).toMatchObject({ kind: "unapplied", reason: "checkout_replaced" });
  });

  it("keeps money for staff when the account was set to close after it opened", async () => {
    const current = await websiteSubscription();
    const subscription = await openCombined(current);
    await dbs.owner.db.update(subscriptions).set({ cancelRequestedAt: NOV_11 }).where(eq(subscriptions.id, current.id));
    expect(await pay(subscription.id, UPFRONT, "fake_pay_closing")).toMatchObject({ kind: "unapplied", reason: "checkout_replaced" });
  });
});

describe("adding a service from the Billing page", () => {
  const provider = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => NOV_11 });
  const deps = () => ({ staffDb: dbs.staff.db, provider, ensureDiscountPlan: async () => undefined });
  const add = (now = NOV_11) => startCombinedAddOn(deps(), { businessId, businessName: "Harbour Bakery", email: "owner@bakery.test", addOn: "social-media", now });

  it("opens the combined subscription for ₹968.42 upfront, and paying it gives the business both services to 11 Dec", async () => {
    const current = await websiteSubscription();

    const started = await add();

    expect(started.kind).toBe("approve");
    if (started.kind !== "approve") return;
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    const confirmed = await provider.confirmCheckout({ token });
    expect(confirmed.amountCents).toBe(UPFRONT);
    const combined = await findSubscriptionById(dbs.staff.db, started.subscriptionId);
    expect(combined).toMatchObject({ continuesId: current.id, firstPaymentCents: UPFRONT, firstChargeAt: DEC_11, bundledAddOnNetCents: 2 * PRICE });

    await pay(started.subscriptionId, confirmed.amountCents, confirmed.providerPaymentId);
    expect((await findBillingState(dbs.staff.db, businessId))?.subscription).toMatchObject({ id: started.subscriptionId, paidThroughAt: DEC_11 });
  });

  it("replaces an earlier combined subscription that was never paid when Add is pressed again", async () => {
    await websiteSubscription();
    const first = await add();
    const second = await add(new Date(NOV_11.getTime() + 60_000));
    if (first.kind !== "approve" || second.kind !== "approve") throw new Error("Both presses should open a combined subscription");
    expect((await findSubscriptionById(dbs.staff.db, first.subscriptionId))?.status).toBe("cancelled");
    expect((await findSubscriptionById(dbs.staff.db, second.subscriptionId))?.status).toBe("incomplete");
  });

  it("waits while another service is set to end, rather than end it early", async () => {
    const current = await websiteSubscription();
    const [website] = await findBundledAddOnsForSubscription(dbs.staff.db, current.id);
    await dbs.owner.db.update(bundledAddOns).set({ endRequestedAt: NOV_1 }).where(eq(bundledAddOns.id, website?.id ?? ""));
    expect(await add()).toEqual({ kind: "change-pending", changesOn: DEC_1 });
  });

  it("leaves monitoring out once the added service completes all three, and the payment still fits", async () => {
    await websiteSubscription(["managed-website", "social-media", "expert-monitoring"]);
    const started = await startCombinedAddOn(deps(), { businessId, businessName: "Harbour Bakery", email: "owner@bakery.test", addOn: "paid-ads", now: NOV_11 });
    if (started.kind !== "approve") throw new Error(`Expected a combined subscription, got ${started.kind}`);

    const lines = await findBundledAddOnsForSubscription(dbs.staff.db, started.subscriptionId);
    expect(lines.map((row) => row.addOn).sort()).toEqual(["managed-website", "paid-ads", "social-media"]);
    const combined = await findSubscriptionById(dbs.staff.db, started.subscriptionId);
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    const confirmed = await provider.confirmCheckout({ token });
    expect(await pay(started.subscriptionId, combined?.firstPaymentCents ?? 0, confirmed.providerPaymentId)).toMatchObject({ kind: "recorded" });
  });
});
