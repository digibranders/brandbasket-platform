import { createFakeBillingProvider, type BillingProvider } from "@fynix/billing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  businessMembers,
  completePlanUpgradeAtRenewal,
  createReferralCode,
  findActivePlan,
  findBillingState,
  findLatestSubscriptionForBusiness,
  findPlanUpgradeInFlight,
  insertSubscription,
  listPaymentsNeedingAttention,
  recordChargePayment,
  recordPaymentAndActivate,
  users,
  type Plan,
  type ReferralDiscount,
  type Subscription,
} from "@fynix/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@fynix/db/testing";
import { activateRenewalPayment } from "./server/billing-activation";
import { assessUpgrade, finishUpgradeAtProvider, readAssessmentInput, startUpgrade, type UpgradeAssessment } from "./server/plan-upgrade";

// These modules are server-only in the app; there is no browser here to keep them out of.
vi.mock("server-only", () => ({}));

/**
 * Moving up from Care to Premium, end to end against a real database and the fake provider: the page's assessment, the
 * quote and its charge, the payment, the provider step, and the renewal that completes it. The cases are the ones in
 * docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md.
 */

const OWNER = "owner-a";
const STAFF = "staff-1";
const NOW = new Date("2026-10-10T09:00:00.000Z");
const PERIOD_END = new Date("2026-10-30T09:00:00.000Z");
const NEXT_PERIOD_END = new Date("2026-11-30T09:00:00.000Z");
const DAY = 86_400_000;
const SECRET = "a-test-secret-that-is-long-enough-000";
const FAKE_SUBSCRIPTION = `fake_sub_${"a".repeat(24)}`;

let dbs: TestDatabases;
let businessId = "";
let care: Plan;
let premium: Plan;
let subscription: Subscription;
let provider: BillingProvider;
let changePlan: ReturnType<typeof vi.fn>;

/** Sets columns on the subscription row under test (test arrangement only). */
function setSubscription(fields: string, id = subscription.id): Promise<void> {
  return execSql(dbs.owner, `update subscriptions set ${fields} where id = '${id}'`);
}

async function requirePlan(tier: "care" | "premium"): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, "INR", tier);
  if (plan === null) throw new Error(`No ${tier} plan seeded`);
  return plan;
}

async function subscribeToCare(providerName: "fake" | "manual", id: string): Promise<Subscription> {
  const created = await insertSubscription(dbs.staff.db, { businessId, planId: care.id, provider: providerName, providerSubscriptionId: id });
  await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: created.id,
    provider: providerName,
    providerPaymentId: `pay_${id}`,
    kind: "initial",
    amountCents: 353_882,
    currency: "INR",
    paidAt: new Date("2026-09-30T09:00:00.000Z"),
    paidThroughAt: PERIOD_END,
    commitmentEndsAt: PERIOD_END,
    currentPeriodEnd: PERIOD_END,
    ...(providerName === "manual" ? { manual: { recordedByStaffId: STAFF, reference: "UTR-1", receivedOn: "2026-09-30" } } : {}),
  });
  const latest = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
  if (latest === null) throw new Error("No subscription");
  return latest;
}

async function assess(now = NOW, providerName: BillingProvider["name"] = "fake"): Promise<UpgradeAssessment> {
  const read = await readAssessmentInput(dbs.staff.db, businessId, providerName, now);
  if (read === null) throw new Error("Business not found");
  return assessUpgrade(read);
}

function start(overrides: Partial<Parameters<typeof startUpgrade>[1]> = {}, now = NOW) {
  return startUpgrade(dbs.staff.db, { businessId, source: "customer", staffId: null, providerName: "fake", now, ...overrides });
}

function payCharge(chargeId: string, amountCents: number, suffix = "1") {
  return recordChargePayment(dbs.staff.db, {
    chargeId,
    businessId,
    provider: "fake",
    providerPaymentId: `fake_pay_${suffix}`,
    amountCents,
    currency: "INR",
    paidAt: NOW,
    now: NOW,
  });
}

function finish(upgradeId: string) {
  return finishUpgradeAtProvider(
    { staffDb: dbs.staff.db, provider, ensureDiscountPlan: async () => "plan_discounted" },
    upgradeId,
    NOW,
  );
}

async function openAndPay(): Promise<{ upgradeId: string; chargeId: string; amount: number }> {
  const started = await start();
  if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
  const charge = await querySql<{ amount_cents: number }>(dbs.owner, `select amount_cents from charges where id = '${started.chargeId}'`);
  const amount = charge[0]?.amount_cents ?? 0;
  const paid = await payCharge(started.chargeId, amount);
  expect(paid.outcome).toBe("paid");
  return { upgradeId: started.upgrade.id, chargeId: started.chargeId, amount };
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
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const [business] = await dbs.staff.db
    .insert(businesses)
    .values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR", signupChoice: "care" })
    .returning({ id: businesses.id });
  businessId = business?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
  subscription = await subscribeToCare("fake", FAKE_SUBSCRIPTION);
  provider = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
  changePlan = vi.fn().mockResolvedValue(undefined);
  provider.changeSubscriptionPlanAtPeriodEnd = changePlan as BillingProvider["changeSubscriptionPlanAtPeriodEnd"];
});

describe("what a Care client is offered", () => {
  it("quotes the difference for the days left, with GST, and Premium's price from the renewal", async () => {
    const offer = await assess();

    expect(offer.kind).toBe("offer");
    if (offer.kind !== "offer") return;
    // ₹9,999 − ₹2,999 = ₹7,000 net for 20 of 30 days, plus 18%.
    expect(offer.quote).toMatchObject({ netDifferenceCents: 466_667, chargeCents: 550_667, daysLeft: 20, periodDays: 30, free: false });
    expect(offer.quote.nextRenewalCents).toBe(1_179_882);
    expect(offer.premium.id).toBe(premium.id);
    expect(offer.carry).toEqual({ kind: "none" });
    expect(offer.retentionEnds).toBe(false);
  });

  it("is a Premium client's no-op: nothing to move up to", async () => {
    await setSubscription(`plan_id = '${premium.id}'`);
    expect(await assess()).toEqual({ kind: "blocked", reason: "already-premium" });
  });

  it("is refused for a client who is leaving, one whose renewal is failing, and one that lapsed", async () => {
    await setSubscription(`cancel_requested_at = '${NOW.toISOString()}'`);
    expect(await assess()).toEqual({ kind: "blocked", reason: "ending" });

    await setSubscription("cancel_requested_at = null, status = 'past_due'");
    expect(await assess()).toEqual({ kind: "blocked", reason: "payment-failing" });

    await setSubscription("status = 'inactive'");
    expect(await assess()).toEqual({ kind: "blocked", reason: "lapsed" });
    // Lapsed by the clock: past its paid-through date, still marked active.
    await setSubscription("status = 'active'");
    expect(await assess(new Date(PERIOD_END.getTime() + DAY))).toEqual({ kind: "blocked", reason: "lapsed" });
  });

  it("is refused while money is waiting for staff", async () => {
    await execSql(
      dbs.owner,
      `insert into payments (id, business_id, subscription_id, provider, provider_payment_id, kind, amount_cents, currency, status, paid_at, attention_reason, attention_raised_at)
       values (gen_random_uuid(), '${businessId}', '${subscription.id}', 'fake', 'pay_review', 'initial', 353882, 'INR', 'captured', '${NOW.toISOString()}', 'checkout_replaced', '${NOW.toISOString()}')`,
    );
    expect(await assess()).toEqual({ kind: "blocked", reason: "under-review" });
  });

  it("is not available when Premium is not on sale, when the provider is not the subscription's, or in the last hour", async () => {
    expect(await assess(NOW, "razorpay")).toEqual({ kind: "unavailable", reason: "provider-not-ready" });
    expect(await assess(new Date(PERIOD_END.getTime() - 30 * 60_000))).toEqual({ kind: "unavailable", reason: "renewal-due" });

    await execSql(dbs.owner, `update plans set active = false where id = '${premium.id}'`);
    expect(await assess()).toEqual({ kind: "unavailable", reason: "no-premium-plan" });
  });

  it("carries a percentage code over to Premium's price, and says when it ends because staff turned the code off", async () => {
    const percent: ReferralDiscount = { kind: "percent", basisPoints: 1000 };
    const code = await createReferralCode(dbs.staff.db, {
      code: "TEN",
      currency: "INR",
      affiliateId: null,
      discount: percent,
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF,
    });
    // On Care it took 10% of ₹2,999: ₹300 net.
    await setSubscription(`referral_code_id = '${code.id}', discount_amount_cents = 30000`);

    const offer = await assess();
    expect(offer.kind).toBe("offer");
    if (offer.kind !== "offer") return;
    expect(offer.carry).toEqual({ kind: "carried", code: "TEN", amountCents: 99_990 });
    expect(offer.fromDiscountCents).toBe(30_000);
    // Premium ₹9,999 − ₹999.90 = ₹8,999.10 against Care ₹2,999 − ₹300 = ₹2,699: ₹6,300.10 net, 20 of 30 days of it.
    expect(offer.quote.netDifferenceCents).toBe(420_007);

    await execSql(dbs.owner, `update referral_codes set active = false where id = '${code.id}'`);
    const dropped = await assess();
    expect(dropped.kind === "offer" && dropped.carry).toEqual({ kind: "dropped", code: "TEN" });
  });

  it("says a stay offer taken on Care ends with the move", async () => {
    const code = await createReferralCode(dbs.staff.db, {
      code: "LAUNCH",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 20_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF,
    });
    await setSubscription(`referral_code_id = '${code.id}', discount_amount_cents = 50000, retention_discount_cents = 30000`);
    const offer = await assess();
    expect(offer.kind === "offer" && offer.retentionEnds).toBe(true);
    // The code's ₹200 carries; the ₹300 stay offer does not.
    expect(offer.kind === "offer" && offer.toDiscountCents).toBe(20_000);
  });
});

describe("asking to move up", () => {
  it("opens a charge for the quoted amount, and asking again the same day finds the same charge", async () => {
    const first = await start();
    expect(first.kind).toBe("pay");
    if (first.kind !== "pay") return;
    const again = await start({}, new Date(NOW.getTime() + 5 * 3_600_000));
    expect(again.kind === "pay" && again.chargeId).toBe(first.chargeId);
    const open = await querySql<{ amount_cents: number; description: string }>(
      dbs.owner,
      `select amount_cents, description from charges where business_id = '${businessId}' and kind = 'plan_upgrade' and status = 'open'`,
    );
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ amount_cents: 550_667, description: "Upgrade to Premium · 20 days left" });
  });

  it("replaces the charge on another day, since the quote has changed", async () => {
    const first = await start();
    const next = await start({}, new Date(NOW.getTime() + DAY));
    expect(first.kind === "pay" && next.kind === "pay" && next.chargeId !== first.chargeId).toBe(true);
    const open = await querySql<{ description: string }>(dbs.owner, "select description from charges where kind = 'plan_upgrade' and status = 'open'");
    expect(open).toHaveLength(1);
    expect(open[0]?.description).toBe("Upgrade to Premium · 19 days left");
  });

  it("refuses with the reason when the business cannot move up, and opens nothing", async () => {
    await setSubscription(`cancel_requested_at = '${NOW.toISOString()}'`);
    expect(await start()).toEqual({ kind: "refused", assessment: { kind: "blocked", reason: "ending" } });
    expect(await findPlanUpgradeInFlight(dbs.staff.db, businessId)).toBeNull();
  });

  it("applies a move at once when the share is too small for the provider to take", async () => {
    // A Premium that costs ₹1 more a month than Care: the share of the last day is a few paise.
    await execSql(dbs.owner, `update plans set recurring_amount_cents = 300000, initial_amount_cents = 300000 where id = '${premium.id}'`);
    const started = await start();
    expect(started.kind).toBe("applied");
    expect(started.kind === "applied" && started.upgrade).toMatchObject({ status: "paid", chargeId: null, chargeCents: 0 });
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ tier: "premium", upgradePaid: true });
  });
});

describe("paying, the provider step and the renewal", () => {
  it("makes the client Premium on payment, moves the provider once, and completes at the renewal", async () => {
    const { upgradeId, amount } = await openAndPay();
    expect(amount).toBe(550_667);
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ tier: "premium", upgradePaid: true });

    expect(await finish(upgradeId)).toEqual({ kind: "scheduled" });
    expect(changePlan).toHaveBeenCalledTimes(1);
    expect(changePlan).toHaveBeenCalledWith(FAKE_SUBSCRIPTION, premium.providerPlanId ?? "");
    expect((await findPlanUpgradeInFlight(dbs.staff.db, businessId))?.status).toBe("scheduled");
    // Running it again moves nothing.
    expect(await finish(upgradeId)).toEqual({ kind: "nothing" });
    expect(changePlan).toHaveBeenCalledTimes(1);

    // The renewal arrives at Premium's price: recorded as a renewal, and the plan switches.
    await dbs.staff.db.transaction(async (tx) => {
      await activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt: PERIOD_END,
        provider: "fake",
        providerPaymentId: "fake_renewal_1",
        amountCents: 1_179_882,
        currency: "INR",
        paidAt: PERIOD_END,
        paidThroughAt: NEXT_PERIOD_END,
        periodStart: PERIOD_END,
        invoicedPrice: { plan: premium, netAmountCents: premium.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      });
      expect(await completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: PERIOD_END })).toBe(true);
    });
    const raw = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    expect(raw).toMatchObject({ planId: premium.id, pendingPlanId: null, paidThroughAt: NEXT_PERIOD_END });
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ tier: "premium", upgradePaid: false });
    expect(await findPlanUpgradeInFlight(dbs.staff.db, businessId)).toBeNull();
  });

  it("uses the code's discounted Premium plan at the provider when a code carries over", async () => {
    const code = await createReferralCode(dbs.staff.db, {
      code: "KEEP",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 50_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF,
    });
    await setSubscription(`referral_code_id = '${code.id}', discount_amount_cents = 50000`);
    const ensure = vi.fn().mockResolvedValue("plan_less_50000");
    const { upgradeId } = await openAndPay();

    expect(await finishUpgradeAtProvider({ staffDb: dbs.staff.db, provider, ensureDiscountPlan: ensure }, upgradeId, NOW)).toEqual({ kind: "scheduled" });

    expect(ensure).toHaveBeenCalledWith(provider, expect.objectContaining({ id: premium.id }), 50_000);
    expect(changePlan).toHaveBeenCalledWith(FAKE_SUBSCRIPTION, "plan_less_50000");
  });

  it("leaves the client on Premium and flags the payment when the provider refuses, and a retry finishes it", async () => {
    const { upgradeId } = await openAndPay();
    changePlan.mockRejectedValueOnce(new Error("Razorpay is down"));

    const failed = await finish(upgradeId);

    expect(failed.kind).toBe("failed");
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ tier: "premium", upgradePaid: true });
    expect((await findPlanUpgradeInFlight(dbs.staff.db, businessId))?.status).toBe("paid");
    const flagged = await listPaymentsNeedingAttention(dbs.staff.db, { businessId, limit: 10 });
    expect(flagged.map((row) => row.reason)).toEqual(["upgrade_provider_pending"]);

    expect(await finish(upgradeId)).toEqual({ kind: "scheduled" });
    expect(changePlan).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an upgrade that was never paid", async () => {
    const started = await start();
    if (started.kind !== "pay") throw new Error("Expected a charge");
    expect(await finish(started.upgrade.id)).toEqual({ kind: "nothing" });
    expect(changePlan).not.toHaveBeenCalled();
  });

  it("refuses to touch a subscription at a provider other than the configured one", async () => {
    const { upgradeId } = await openAndPay();
    await setSubscription("provider = 'razorpay', provider_subscription_id = 'sub_rzp_1'");
    expect((await finish(upgradeId)).kind).toBe("failed");
    expect(changePlan).not.toHaveBeenCalled();
  });

  it("holds a second move while the first is paid and waiting", async () => {
    await openAndPay();
    expect(await start()).toEqual({ kind: "refused", assessment: { kind: "blocked", reason: "already-moving" } });
  });

  it("keeps a payment that arrives after the month renewed as one to refund, and offers the client a fresh quote", async () => {
    const started = await start();
    if (started.kind !== "pay") throw new Error("Expected a charge");
    await setSubscription(`paid_through_at = '${NEXT_PERIOD_END.toISOString()}', current_period_end = '${NEXT_PERIOD_END.toISOString()}', commitment_ends_at = '${NEXT_PERIOD_END.toISOString()}'`);

    const late = await payCharge(started.chargeId, 550_667);

    expect(late.outcome).toBe("upgrade-not-applied");
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ tier: "care", upgradePaid: false });
    const row = await querySql<{ status: string }>(dbs.owner, `select status from plan_upgrades where id = '${started.upgrade.id}'`);
    expect(row[0]?.status).toBe("cancelled");
    // And they can start again against the new month.
    const fresh = await start({}, new Date(NEXT_PERIOD_END.getTime() - 10 * DAY));
    expect(fresh.kind).toBe("pay");
  });
});

describe("staff moving a client", () => {
  it("moves a Care client with nothing to take, recorded as staff's doing", async () => {
    const started = await start({ source: "staff", staffId: STAFF, noCharge: true });

    expect(started.kind).toBe("applied");
    expect(started.kind === "applied" && started.upgrade).toMatchObject({ source: "staff", createdByStaffId: STAFF, chargeId: null, status: "paid" });
    expect(await finish(started.kind === "applied" ? started.upgrade.id : "")).toEqual({ kind: "scheduled" });
  });

  it("moves a bank-transfer client, whose plan changes at once because nothing bills it", async () => {
    // A fresh business on a manual subscription (the first has payments pointing at it).
    const [other] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "mumbai-bakery", name: "Mumbai Bakery", currency: "INR", signupChoice: "care" })
      .returning({ id: businesses.id });
    const otherId = other?.id ?? "";
    const created = await insertSubscription(dbs.staff.db, { businessId: otherId, planId: care.id, provider: "manual", providerSubscriptionId: "manual_1" });
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId: otherId,
      subscriptionId: created.id,
      provider: "manual",
      providerPaymentId: "manual_pay_1",
      kind: "initial",
      amountCents: 353_882,
      currency: "INR",
      paidAt: new Date("2026-09-30T09:00:00.000Z"),
      paidThroughAt: PERIOD_END,
      commitmentEndsAt: PERIOD_END,
      currentPeriodEnd: PERIOD_END,
      manual: { recordedByStaffId: STAFF, reference: "UTR-2", receivedOn: "2026-09-30" },
    });
    expect(await startUpgrade(dbs.staff.db, { businessId: otherId, source: "customer", staffId: null, providerName: "fake", now: NOW })).toEqual({
      kind: "refused",
      assessment: { kind: "blocked", reason: "manual-billing" },
    });

    const started = await startUpgrade(dbs.staff.db, {
      businessId: otherId,
      source: "staff",
      staffId: STAFF,
      providerName: "fake",
      now: NOW,
      allowBlocks: ["manual-billing"],
      noCharge: true,
    });
    expect(started.kind).toBe("applied");
    if (started.kind !== "applied") return;

    expect(await finish(started.upgrade.id)).toEqual({ kind: "completed" });
    expect(changePlan).not.toHaveBeenCalled();
    const raw = await findLatestSubscriptionForBusiness(dbs.staff.db, otherId);
    expect(raw).toMatchObject({ planId: premium.id, pendingPlanId: null });
    expect(await findBillingState(dbs.staff.db, otherId)).toMatchObject({ tier: "premium" });
  });
});

describe("edge cases around prices and providers", () => {
  it("quotes a Care client on the plan their subscription was sold on, even after Care was repriced", async () => {
    // Staff reprice Care: a new plan version is on sale, the old one is retired, and the subscription keeps the old.
    await execSql(dbs.owner, `update plans set active = false where id = '${care.id}'`);
    await execSql(
      dbs.owner,
      `insert into plans (id, code, name, currency, tier, initial_amount_cents, initial_term_months, recurring_amount_cents, included_publishes_per_month, extra_publish_amount_cents, tax_rate_basis_points, active)
       values (gen_random_uuid(), 'care-inr-repriced', 'Fynix Care', 'INR', 'care', 499900, 1, 499900, 3, 300, 1800, true)`,
    );

    const offer = await assess();

    expect(offer.kind).toBe("offer");
    // Still ₹2,999 on Care, not the new ₹4,999: ₹7,000 net for 20 of 30 days.
    expect(offer.kind === "offer" && offer.care.id).toBe(care.id);
    expect(offer.kind === "offer" && offer.quote.netDifferenceCents).toBe(466_667);
  });

  it("keeps the Premium plan the customer was quoted, even if Premium is repriced before the renewal", async () => {
    const { upgradeId } = await openAndPay();
    // Premium goes to ₹12,999: a new version on sale, the one they were sold retired.
    await execSql(dbs.owner, `update plans set active = false where id = '${premium.id}'`);
    await execSql(
      dbs.owner,
      `insert into plans (id, code, name, currency, tier, initial_amount_cents, initial_term_months, recurring_amount_cents, included_publishes_per_month, extra_publish_amount_cents, tax_rate_basis_points, active, provider_plan_id)
       values (gen_random_uuid(), 'premium-inr-repriced', 'Fynix Premium', 'INR', 'premium', 1299900, 1, 1299900, 3, 300, 1800, true, 'plan_new_premium')`,
    );

    expect(await finish(upgradeId)).toEqual({ kind: "scheduled" });

    // The provider is moved to the plan they paid for, not the new price.
    expect(changePlan).toHaveBeenCalledWith(FAKE_SUBSCRIPTION, premium.providerPlanId ?? "");
    const raw = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    expect(raw?.pendingPlanId).toBe(premium.id);
  });

  it("two presses at the same moment open one charge, not two", async () => {
    const [first, second] = await Promise.all([start(), start()]);

    expect([first.kind, second.kind]).toEqual(["pay", "pay"]);
    const open = await querySql<{ id: string }>(dbs.owner, `select id from charges where kind = 'plan_upgrade' and status = 'open' and business_id = '${businessId}'`);
    expect(open).toHaveLength(1);
    const moves = await querySql<{ status: string }>(dbs.owner, `select status from plan_upgrades where business_id = '${businessId}' and status = 'open'`);
    expect(moves).toHaveLength(1);
  });

  it("two payments for the same charge at the same moment apply the move once", async () => {
    const started = await start();
    if (started.kind !== "pay") throw new Error("Expected a charge");
    const [a, b] = await Promise.all([payCharge(started.chargeId, 550_667, "a"), payCharge(started.chargeId, 550_667, "b")]);

    expect([a.outcome, b.outcome].sort()).toEqual(["not-open", "paid"]);
    const moves = await querySql<{ status: string }>(dbs.owner, `select status from plan_upgrades where business_id = '${businessId}'`);
    expect(moves.map((row) => row.status)).toEqual(["paid"]);
  });

  it("offers Razorpay clients the move only once Premium has a Razorpay plan to bill", async () => {
    await setSubscription("provider = 'razorpay', provider_subscription_id = 'sub_rzp_1'");
    await execSql(dbs.owner, `update plans set provider_plan_id = null where id = '${premium.id}'`);
    expect(await assess(NOW, "razorpay")).toEqual({ kind: "unavailable", reason: "provider-not-ready" });

    await execSql(dbs.owner, `update plans set provider_plan_id = 'plan_premium_rzp' where id = '${premium.id}'`);
    expect((await assess(NOW, "razorpay")).kind).toBe("offer");
  });

  it("moves a Razorpay subscription to Premium's Razorpay plan, and flags the payment when Premium has none", async () => {
    await setSubscription("provider = 'razorpay', provider_subscription_id = 'sub_rzp_1'");
    await execSql(dbs.owner, `update plans set provider_plan_id = 'plan_premium_rzp' where id = '${premium.id}'`);
    const razorpay = { ...provider, name: "razorpay" as const, changeSubscriptionPlanAtPeriodEnd: changePlan } as BillingProvider;
    const started = await startUpgrade(dbs.staff.db, { businessId, source: "customer", staffId: null, providerName: "razorpay", now: NOW });
    if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
    await payCharge(started.chargeId, 550_667);

    // Premium's Razorpay plan goes missing before the step runs (it should not, but the step must not guess).
    await execSql(dbs.owner, `update plans set provider_plan_id = null where id = '${premium.id}'`);
    const failed = await finishUpgradeAtProvider({ staffDb: dbs.staff.db, provider: razorpay, ensureDiscountPlan: async () => undefined }, started.upgrade.id, NOW);
    expect(failed.kind).toBe("failed");
    expect(changePlan).not.toHaveBeenCalled();
    expect((await listPaymentsNeedingAttention(dbs.staff.db, { businessId, limit: 5 })).map((row) => row.reason)).toEqual(["upgrade_provider_pending"]);

    await execSql(dbs.owner, `update plans set provider_plan_id = 'plan_premium_rzp' where id = '${premium.id}'`);
    expect(await finishUpgradeAtProvider({ staffDb: dbs.staff.db, provider: razorpay, ensureDiscountPlan: async () => undefined }, started.upgrade.id, NOW)).toEqual({ kind: "scheduled" });
    expect(changePlan).toHaveBeenCalledWith("sub_rzp_1", "plan_premium_rzp");
  });

  it("never offers a move to a client who is already Premium by a paid move waiting for its renewal", async () => {
    await openAndPay();
    expect(await assess()).toEqual({ kind: "blocked", reason: "already-moving" });
  });

  it("lets a Care client whose renewal failed and was then paid move up again", async () => {
    await setSubscription("status = 'past_due'");
    expect(await assess()).toEqual({ kind: "blocked", reason: "payment-failing" });
    await setSubscription("status = 'active'");
    expect((await assess()).kind).toBe("offer");
  });

  it("works a month that is not thirty days: the share is of the days that month has", async () => {
    // A period of 28 days with 14 left is exactly half the difference.
    const periodStart = new Date(NOW.getTime() - 14 * DAY);
    await setSubscription(`activated_at = '${periodStart.toISOString()}'`);
    await setSubscription(`commitment_ends_at = '${new Date(NOW.getTime() + 14 * DAY).toISOString()}', paid_through_at = '${new Date(NOW.getTime() + 14 * DAY).toISOString()}', current_period_end = '${new Date(NOW.getTime() + 14 * DAY).toISOString()}'`);
    const offer = await assess();
    expect(offer.kind === "offer" && offer.quote).toMatchObject({ periodDays: 28, daysLeft: 14, netDifferenceCents: 350_000 });
  });
});
