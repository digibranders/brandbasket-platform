import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findActivePlan,
  findBillingState,
  findLatestSubscriptionForBusiness,
  insertSubscription,
  recordPaymentAndActivate,
  type Plan,
  type Subscription,
} from "./queries/billing";
import { findChargeForBusiness, recordChargePayment, waiveCharge } from "./queries/charges";
import { listClients } from "./queries/clients";
import { createReferralCode } from "./queries/referrals";
import {
  applyPaidPlanUpgrade,
  cancelOpenPlanUpgrade,
  completePlanUpgradeAtRenewal,
  countPlanUpgradesByStatus,
  findPlanUpgradeByCharge,
  findPlanUpgradeInFlight,
  listPlanUpgradesForBusiness,
  markPlanUpgradeScheduled,
  openPlanUpgrade,
  PlanUpgradeNotPossibleError,
  type NewPlanUpgrade,
} from "./queries/plan-upgrades";
import { businesses, businessMembers, charges, payments, planUpgrades, subscriptions, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const STAFF = "staff-1";
const NOW = new Date("2026-10-10T09:00:00.000Z");
const PERIOD_END = new Date("2026-10-30T09:00:00.000Z");
const NEXT_PERIOD_END = new Date("2026-11-30T09:00:00.000Z");

/** 20 of 30 days left of a month that costs ₹2,999 on Care and ₹6,999 on Premium: ₹4,000 × 20/30 = ₹2,666.67 net. */
const NET_DIFFERENCE = 266_667;
/** With 18% GST. */
const CHARGE_CENTS = 314_667;

let dbs: TestDatabases;
let businessA = "";
let businessB = "";
let care: Plan;
let premium: Plan;
let subscription: Subscription;

async function requirePlan(tier: "care" | "premium"): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, "INR", tier);
  if (plan === null) throw new Error(`No ${tier} plan seeded`);
  return plan;
}

/** A Care client paid through PERIOD_END, on a fake-provider subscription. */
async function subscribeToCare(businessId: string, providerSubscriptionId: string): Promise<Subscription> {
  const created = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: care.id,
    provider: "fake",
    providerSubscriptionId,
  });
  await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: created.id,
    provider: "fake",
    providerPaymentId: `pay_${providerSubscriptionId}`,
    kind: "initial",
    amountCents: 353_882,
    currency: "INR",
    paidAt: new Date("2026-09-30T09:00:00.000Z"),
    paidThroughAt: PERIOD_END,
    commitmentEndsAt: PERIOD_END,
    currentPeriodEnd: PERIOD_END,
  });
  const latest = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
  if (latest === null) throw new Error("No subscription");
  return latest;
}

function upgradeInput(overrides: Partial<NewPlanUpgrade> = {}): NewPlanUpgrade {
  return {
    businessId: businessA,
    subscriptionId: subscription.id,
    fromPlanId: care.id,
    toPlanId: premium.id,
    fromDiscountAmountCents: 0,
    toDiscountAmountCents: 0,
    periodEnd: PERIOD_END,
    netDifferenceCents: NET_DIFFERENCE,
    chargeCents: CHARGE_CENTS,
    taxRateBasisPoints: 1800,
    currency: "INR",
    description: "Upgrade to Premium · 20 days left",
    source: "customer",
    staffId: null,
    now: NOW,
    ...overrides,
  };
}

function open(overrides: Partial<NewPlanUpgrade> = {}) {
  return dbs.staff.db.transaction((tx) => openPlanUpgrade(tx, upgradeInput(overrides)));
}

function pay(chargeId: string, providerPaymentId: string, amountCents = CHARGE_CENTS) {
  return recordChargePayment(dbs.staff.db, {
    chargeId,
    businessId: businessA,
    provider: "fake",
    providerPaymentId,
    amountCents,
    currency: "INR",
    paidAt: NOW,
    now: NOW,
  });
}

async function rawSubscription(): Promise<Subscription> {
  const row = await findLatestSubscriptionForBusiness(dbs.staff.db, businessA);
  if (row === null) throw new Error("No subscription");
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
  care = await requirePlan("care");
  premium = await requirePlan("premium");
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Asha", email: "asha@example.com" },
    { id: OTHER_OWNER, name: "Ben", email: "ben@example.com" },
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR", signupChoice: "care" },
      { slug: "mumbai-bakery", name: "Mumbai Bakery", currency: "INR", signupChoice: "care" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "mumbai-bakery")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER, role: "owner" },
    { businessId: businessB, userId: OTHER_OWNER, role: "owner" },
  ]);
  subscription = await subscribeToCare(businessA, "sub_care_a");
});

describe("opening a move up with a charge to pay", () => {
  it("records the quote and its charge, and changes nothing about the client until it is paid", async () => {
    const { upgrade, chargeId } = await open();

    expect(upgrade).toMatchObject({
      status: "open",
      source: "customer",
      fromPlanId: care.id,
      toPlanId: premium.id,
      periodEnd: PERIOD_END,
      netDifferenceCents: NET_DIFFERENCE,
      chargeCents: CHARGE_CENTS,
    });
    expect(chargeId).not.toBeNull();
    const charge = await findChargeForBusiness(dbs.staff.db, businessA, chargeId ?? "");
    expect(charge).toMatchObject({
      kind: "plan_upgrade",
      status: "open",
      quantity: 1,
      unitAmountCents: NET_DIFFERENCE,
      amountCents: CHARGE_CENTS,
      taxRateBasisPoints: 1800,
      currency: "INR",
      description: "Upgrade to Premium · 20 days left",
    });
    expect((await findPlanUpgradeInFlight(dbs.staff.db, businessA))?.id).toBe(upgrade.id);
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "care", upgradePaid: false });
    expect(await rawSubscription()).toMatchObject({ pendingPlanId: null, pendingDiscountAmountCents: 0 });
  });

  it("replaces an earlier open quote: the old charge can no longer be paid and only one is open", async () => {
    const first = await open();
    const second = await open({ netDifferenceCents: 250_000, chargeCents: 295_000 });

    expect(second.upgrade.id).not.toBe(first.upgrade.id);
    const oldCharge = await findChargeForBusiness(dbs.staff.db, businessA, first.chargeId ?? "");
    expect(oldCharge?.status).toBe("waived");
    const rows = await listPlanUpgradesForBusiness(dbs.staff.db, businessA);
    expect(rows.map((row) => row.status).sort()).toEqual(["cancelled", "open"]);
    const openCharges = await dbs.staff.db
      .select({ id: charges.id })
      .from(charges)
      .where(and(eq(charges.businessId, businessA), eq(charges.kind, "plan_upgrade"), eq(charges.status, "open")));
    expect(openCharges).toHaveLength(1);
  });

  it("refuses when the subscription is no longer the one the quote was for", async () => {
    await dbs.staff.db.update(subscriptions).set({ paidThroughAt: NEXT_PERIOD_END }).where(eq(subscriptions.id, subscription.id));
    await expect(open()).rejects.toMatchObject({ name: "PlanUpgradeNotPossibleError", reason: "not-live" });

    await dbs.staff.db.update(subscriptions).set({ paidThroughAt: PERIOD_END, planId: premium.id }).where(eq(subscriptions.id, subscription.id));
    await expect(open()).rejects.toMatchObject({ reason: "plan-changed" });
  });

  it("refuses a subscription that is leaving, past due, or not there", async () => {
    await dbs.staff.db.update(subscriptions).set({ cancelRequestedAt: NOW }).where(eq(subscriptions.id, subscription.id));
    await expect(open()).rejects.toThrow(PlanUpgradeNotPossibleError);
    await dbs.staff.db.update(subscriptions).set({ cancelRequestedAt: null, status: "past_due" }).where(eq(subscriptions.id, subscription.id));
    await expect(open()).rejects.toThrow(PlanUpgradeNotPossibleError);
    await expect(open({ subscriptionId: "0192f3c4-3333-7000-8000-000000000003" })).rejects.toMatchObject({ reason: "no-subscription" });
  });

  it("refuses a second move while one has been paid and is waiting for its renewal", async () => {
    const { chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");
    await expect(open()).rejects.toMatchObject({ reason: "already-moving" });
  });

  it("allows only one move in flight per business, by the database's own rule", async () => {
    await open();
    const error = await captureErrorText(
      dbs.staff.db.insert(planUpgrades).values({
        businessId: businessA,
        subscriptionId: subscription.id,
        fromPlanId: care.id,
        toPlanId: premium.id,
        periodEnd: PERIOD_END,
        netDifferenceCents: 0,
        chargeCents: 0,
        source: "customer",
      }),
    );
    expect(error).toMatch(/plan_upgrades_one_in_flight_idx/);
  });
});

describe("paying for the move", () => {
  it("makes the client Premium at once: charge paid, upgrade paid, billing read as the new plan", async () => {
    const { upgrade, chargeId } = await open();

    const result = await pay(chargeId ?? "", "fake_pay_1");

    expect(result).toMatchObject({ outcome: "paid", alreadyRecorded: false });
    expect(result.payment).toMatchObject({ kind: "charge", amountCents: CHARGE_CENTS, attentionReason: null });
    expect((await findChargeForBusiness(dbs.staff.db, businessA, chargeId ?? ""))?.status).toBe("paid");
    const paid = await findPlanUpgradeByCharge(dbs.staff.db, chargeId ?? "");
    expect(paid).toMatchObject({ id: upgrade.id, status: "paid", paidAt: NOW });

    const state = await findBillingState(dbs.staff.db, businessA);
    expect(state).toMatchObject({ tier: "premium", upgradePaid: true });
    expect(state?.plan?.id).toBe(premium.id);
    // The row the customer sees is the new plan's, with no stay offer; its dates are still the old plan's.
    expect(state?.subscription).toMatchObject({ planId: premium.id, discountAmountCents: 0, retentionDiscountCents: 0, paidThroughAt: PERIOD_END });
    // The row the webhook checks renewals against is still the plan the provider is billing.
    expect(await rawSubscription()).toMatchObject({ planId: care.id, pendingPlanId: premium.id, pendingDiscountAmountCents: 0 });
  });

  it("carries a code's discount over to the new plan, for the page and for the renewal", async () => {
    // A referral code row is needed only to satisfy the rule that a discount names its code.
    const created = await createReferralCode(dbs.staff.db, {
      code: "KEEP500",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 50_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF,
    });
    const codeId = created.id;
    await dbs.staff.db.update(subscriptions).set({ referralCodeId: codeId, discountAmountCents: 30_000 }).where(eq(subscriptions.id, subscription.id));
    const { chargeId } = await open({ fromDiscountAmountCents: 30_000, toDiscountAmountCents: 50_000 });

    await pay(chargeId ?? "", "fake_pay_1");

    const state = await findBillingState(dbs.staff.db, businessA);
    expect(state?.subscription).toMatchObject({ discountAmountCents: 50_000 });
    expect(await rawSubscription()).toMatchObject({ discountAmountCents: 30_000, pendingDiscountAmountCents: 50_000 });
  });

  it("records a payment delivered twice once, and applies the move once", async () => {
    const { chargeId } = await open();
    const first = await pay(chargeId ?? "", "fake_pay_1");
    const again = await pay(chargeId ?? "", "fake_pay_1");

    expect(again).toMatchObject({ outcome: "paid", alreadyRecorded: true });
    expect(again.payment.id).toBe(first.payment.id);
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ paid: 1, open: 0 });
    const rows = await dbs.staff.db.select().from(payments).where(eq(payments.businessId, businessA));
    expect(rows.filter((row) => row.kind === "charge")).toHaveLength(1);
  });

  it("keeps a second payment for the same charge as a duplicate to refund, and changes nothing more", async () => {
    const { chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");

    const duplicate = await pay(chargeId ?? "", "fake_pay_2");

    expect(duplicate).toMatchObject({ outcome: "not-open", alreadyRecorded: false });
    expect(duplicate.payment.attentionReason).toBe("already_paid");
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ paid: 1 });
  });

  it("does not treat a wrong amount as the move being paid for", async () => {
    const { chargeId } = await open();

    const result = await pay(chargeId ?? "", "fake_pay_1", CHARGE_CENTS - 1);

    expect(result).toMatchObject({ outcome: "amount-mismatch" });
    expect(result.payment.attentionReason).toBe("amount_mismatch");
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "care" });
    expect((await findPlanUpgradeInFlight(dbs.staff.db, businessA))?.status).toBe("open");
  });

  it("keeps the money and applies nothing when the month renewed before the payment arrived", async () => {
    const { chargeId } = await open();
    await dbs.staff.db.update(subscriptions).set({ paidThroughAt: NEXT_PERIOD_END }).where(eq(subscriptions.id, subscription.id));

    const result = await pay(chargeId ?? "", "fake_pay_1");

    expect(result.outcome).toBe("upgrade-not-applied");
    expect(result.payment).toMatchObject({ amountCents: CHARGE_CENTS, attentionReason: "upgrade_not_applied" });
    expect((await findChargeForBusiness(dbs.staff.db, businessA, chargeId ?? ""))?.status).toBe("waived");
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ cancelled: 1, open: 0, paid: 0 });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "care", upgradePaid: false });
    expect(await rawSubscription()).toMatchObject({ pendingPlanId: null });
    // A flagged payment for an upgrade is one to refund, so it is on the staff attention list as unapplied.
    expect(result.alreadyRecorded).toBe(false);
  });

  it("applies nothing when the subscription began leaving, or staff already changed its plan", async () => {
    const first = await open();
    await dbs.staff.db.update(subscriptions).set({ cancelRequestedAt: NOW }).where(eq(subscriptions.id, subscription.id));
    expect((await pay(first.chargeId ?? "", "fake_pay_1")).outcome).toBe("upgrade-not-applied");

    await dbs.staff.db.update(subscriptions).set({ cancelRequestedAt: null }).where(eq(subscriptions.id, subscription.id));
    const second = await open();
    await dbs.staff.db.update(subscriptions).set({ planId: premium.id }).where(eq(subscriptions.id, subscription.id));
    expect((await pay(second.chargeId ?? "", "fake_pay_2")).outcome).toBe("upgrade-not-applied");
    expect(await rawSubscription()).toMatchObject({ pendingPlanId: null });
  });

  it("keeps a payment for a charge staff waived as a duplicate to refund, and the upgrade cancelled", async () => {
    const { chargeId } = await open();
    expect(await waiveCharge(dbs.staff.db, { chargeId: chargeId ?? "", businessId: businessA, staffId: STAFF, now: NOW })).toBe(true);
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ cancelled: 1, open: 0 });

    const result = await pay(chargeId ?? "", "fake_pay_1");

    expect(result.outcome).toBe("not-open");
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "care" });
  });
});

describe("a move with nothing to take", () => {
  it("is applied at once, with no charge: for a share too small to charge, or staff moving a client", async () => {
    const { upgrade, chargeId } = await open({ chargeCents: 0, netDifferenceCents: 0, source: "staff", staffId: STAFF });

    expect(chargeId).toBeNull();
    expect(upgrade).toMatchObject({ status: "paid", chargeId: null, source: "staff", createdByStaffId: STAFF, paidAt: NOW });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "premium", upgradePaid: true });
    expect(await rawSubscription()).toMatchObject({ planId: care.id, pendingPlanId: premium.id });
  });

  it("insists a staff move names the staff member, and a customer's does not", async () => {
    const error = await captureErrorText(
      dbs.staff.db.insert(planUpgrades).values({
        businessId: businessA,
        subscriptionId: subscription.id,
        fromPlanId: care.id,
        toPlanId: premium.id,
        periodEnd: PERIOD_END,
        netDifferenceCents: 0,
        chargeCents: 0,
        source: "staff",
      }),
    );
    expect(error).toMatch(/plan_upgrades_staff_check/);
  });
});

describe("cancelling an open move", () => {
  it("closes the quote and its charge, and leaves a paid move alone", async () => {
    const { chargeId } = await open();
    const cancelled = await dbs.staff.db.transaction((tx) => cancelOpenPlanUpgrade(tx, businessA, NOW));
    expect(cancelled?.status).toBe("cancelled");
    expect((await findChargeForBusiness(dbs.staff.db, businessA, chargeId ?? ""))?.status).toBe("waived");
    expect(await dbs.staff.db.transaction((tx) => cancelOpenPlanUpgrade(tx, businessA, NOW))).toBeNull();

    const next = await open();
    await pay(next.chargeId ?? "", "fake_pay_1");
    expect(await dbs.staff.db.transaction((tx) => cancelOpenPlanUpgrade(tx, businessA, NOW))).toBeNull();
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ paid: 1, cancelled: 1 });
  });
});

describe("a business that comes back on a new subscription", () => {
  it("is not held by a move that was paid on the subscription that ended", async () => {
    const { chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");
    // The subscription ends and is cancelled; the business later subscribes to Care again.
    await dbs.staff.db.update(subscriptions).set({ status: "cancelled", cancelledAt: NOW }).where(eq(subscriptions.id, subscription.id));
    const again = await insertSubscription(dbs.staff.db, { businessId: businessA, planId: care.id, provider: "fake", providerSubscriptionId: "sub_care_again" });
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId: businessA,
      subscriptionId: again.id,
      provider: "fake",
      providerPaymentId: "pay_again",
      kind: "initial",
      amountCents: 353_882,
      currency: "INR",
      paidAt: NOW,
      paidThroughAt: NEXT_PERIOD_END,
      commitmentEndsAt: NEXT_PERIOD_END,
      currentPeriodEnd: NEXT_PERIOD_END,
    });

    const fresh = await open({ subscriptionId: again.id, periodEnd: NEXT_PERIOD_END });

    expect(fresh.upgrade.status).toBe("open");
    const rows = await listPlanUpgradesForBusiness(dbs.staff.db, businessA);
    expect(rows.map((row) => row.status).sort()).toEqual(["cancelled", "open"]);
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "care", upgradePaid: false });
  });
});

describe("scheduling at the provider and the renewal", () => {
  it("marks a paid move scheduled once, and not again", async () => {
    const { upgrade, chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");

    expect(await markPlanUpgradeScheduled(dbs.staff.db, { upgradeId: upgrade.id, providerPlanId: "plan_premium", now: NOW })).toBe(true);
    expect(await markPlanUpgradeScheduled(dbs.staff.db, { upgradeId: upgrade.id, providerPlanId: "plan_premium", now: NOW })).toBe(false);
    expect((await findPlanUpgradeInFlight(dbs.staff.db, businessA))).toMatchObject({ status: "scheduled", providerPlanId: "plan_premium", scheduledAt: NOW });
  });

  it("does not schedule a move that is still open", async () => {
    const { upgrade } = await open();
    expect(await markPlanUpgradeScheduled(dbs.staff.db, { upgradeId: upgrade.id, providerPlanId: "plan_premium", now: NOW })).toBe(false);
  });

  it("switches the subscription to the new plan at the first renewal at its price, ending the stay offer", async () => {
    await dbs.staff.db.update(subscriptions).set({ retentionDiscountCents: 0 }).where(eq(subscriptions.id, subscription.id));
    const { upgrade, chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");
    await markPlanUpgradeScheduled(dbs.staff.db, { upgradeId: upgrade.id, providerPlanId: "plan_premium", now: NOW });

    const done = await dbs.staff.db.transaction((tx) => completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: NEXT_PERIOD_END }));

    expect(done).toBe(true);
    expect(await rawSubscription()).toMatchObject({ planId: premium.id, pendingPlanId: null, pendingDiscountAmountCents: 0, discountAmountCents: 0 });
    expect(await findPlanUpgradeInFlight(dbs.staff.db, businessA)).toBeNull();
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ completed: 1 });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "premium", upgradePaid: false });
    // Doing it again, as a redelivered webhook would, changes nothing.
    expect(await dbs.staff.db.transaction((tx) => completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: NEXT_PERIOD_END }))).toBe(false);
  });

  it("completes a move whose provider step never ran, since the renewal at the new price proves it did", async () => {
    const { chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");
    expect(await dbs.staff.db.transaction((tx) => completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: NEXT_PERIOD_END }))).toBe(true);
    expect(await countPlanUpgradesByStatus(dbs.staff.db, businessA)).toMatchObject({ completed: 1, paid: 0 });
  });

  it("leaves a subscription with no pending plan alone", async () => {
    expect(await dbs.staff.db.transaction((tx) => completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: NOW }))).toBe(false);
    expect(await rawSubscription()).toMatchObject({ planId: care.id });
  });

  it("lets a business move again only once the first has completed", async () => {
    const first = await open();
    await pay(first.chargeId ?? "", "fake_pay_1");
    await dbs.staff.db.transaction((tx) => completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: NEXT_PERIOD_END }));
    // Now Premium: a second move up from Premium is the platform's refusal, but the record itself allows a new row.
    await dbs.staff.db.update(subscriptions).set({ paidThroughAt: NEXT_PERIOD_END }).where(eq(subscriptions.id, subscription.id));
    await expect(
      open({ fromPlanId: premium.id, toPlanId: care.id, periodEnd: NEXT_PERIOD_END, chargeCents: 0, netDifferenceCents: 0, source: "staff", staffId: STAFF }),
    ).resolves.toBeDefined();
  });
});

describe("what staff and customers see", () => {
  it("counts a paid move up as Premium in the staff client list at once", async () => {
    expect((await listClients(dbs.staff.db)).find((row) => row.businessId === businessA)?.tier).toBe("care");
    const { chargeId } = await open();
    await pay(chargeId ?? "", "fake_pay_1");
    expect((await listClients(dbs.staff.db)).find((row) => row.businessId === businessA)?.tier).toBe("premium");
  });

  it("lets a customer read their own upgrade and nobody else's, and never write one", async () => {
    await open();
    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId: businessA }, (tx) => findPlanUpgradeInFlight(tx, businessA));
    const other = await withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: businessB }, (tx) => findPlanUpgradeInFlight(tx, businessA));
    expect(own?.status).toBe("open");
    expect(other).toBeNull();

    const error = await captureErrorText(
      withTenantScope(dbs.app.db, { userId: OWNER, businessId: businessA }, (tx) =>
        tx.insert(planUpgrades).values({
          businessId: businessA,
          subscriptionId: subscription.id,
          fromPlanId: care.id,
          toPlanId: premium.id,
          periodEnd: PERIOD_END,
          netDifferenceCents: 0,
          chargeCents: 0,
          source: "customer",
        }),
      ),
    );
    expect(error).toMatch(/permission denied/i);
  });

  it("applyPaidPlanUpgrade does nothing for a charge with no open upgrade behind it", async () => {
    const { chargeId } = await open();
    await dbs.staff.db.transaction((tx) => applyPaidPlanUpgrade(tx, chargeId ?? "", NOW));
    const again = await dbs.staff.db.transaction((tx) => applyPaidPlanUpgrade(tx, chargeId ?? "", NOW));
    expect(again).toBeNull();
  });
});
