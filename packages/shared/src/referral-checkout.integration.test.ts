import { chargedAmountCents, createFakeBillingProvider, decideCheckout, discountCentsFor, normaliseReferralCode } from "@brandbasket/billing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  cancelAffiliateEarning,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findBillingState,
  findBusinessReferralCode,
  findLatestSubscriptionForBusiness,
  findRedeemableReferralCode,
  listAffiliateEarnings,
  listPaymentsForBusiness,
  openCheckoutSubscription,
  setBusinessReferralCode,
  updateAffiliate,
  updateReferralCode,
  users,
  type Plan,
  type ReferralDiscount,
  type ReferralReward,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedManagedWebsitePlans, type TestDatabases } from "@brandbasket/db/testing";
import { activateFirstPayment, activateRenewalPayment } from "./server/billing-activation";

// billing-activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The whole code money path, end to end, against a real database: a superadmin creates a coupon or an affiliate
 * code, a customer applies it, a checkout opens at the discounted amount, the customer pays, the subscription
 * activates, and an affiliate code earns its affiliate a month for that payment and every renewal.
 *
 * This runs the same functions the app does (`packages/db`'s queries, `packages/billing`'s decision and provider,
 * and the same activation call the webhook makes) rather than doubles of them. What it deliberately does not
 * cover is the React UI and Next's server actions; those need a signed-in browser session.
 */

const STAFF_USER = "staff-e2e";
const NOW = new Date("2026-09-22T12:00:00.000Z");
const SECRET = "a-test-secret-that-is-long-enough-000";

let dbs: TestDatabases;
let businessId = "";

async function requirePlan(): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR plan was seeded");
  return plan;
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

beforeAll(async () => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  // These check how a code's discount and an affiliate's reward are worked out, to the paisa, against Managed Website at
  // ₹2,999 (the figures below are built on it).
  await seedManagedWebsitePlans(dbs.owner);
  await dbs.owner.db
    .insert(users)
    .values({ id: STAFF_USER, name: "Superadmin", email: "admin@example.test", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "curry-cook", name: "Curry Cook", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

const AFFILIATE_REWARD: ReferralReward = { kind: "amount", amountCents: 20_000 };

async function seedAffiliate(reward: ReferralReward = AFFILIATE_REWARD, rewardCycles: number | null = null): Promise<string> {
  const affiliate = await createAffiliate(dbs.staff.db, {
    name: "Asha Nair",
    email: "asha@example.com",
    phone: null,
    reward,
    rewardCurrency: reward.kind === "amount" ? "INR" : null,
    rewardCycles,
    notes: null,
    createdByStaffId: STAFF_USER,
  });
  return affiliate.id;
}

async function seedCode(code: string, affiliateId: string | null, discount: ReferralDiscount | null): Promise<string> {
  const created = await createReferralCode(dbs.staff.db, {
    code,
    currency: "INR",
    affiliateId,
    discount,
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  return created.id;
}

/** Opens a checkout on the code and pays it through the activation the webhook uses. */
async function payFirstMonth(codeId: string, discountAmountCents: number): Promise<Subscription> {
  const plan = await requirePlan();
  const staffDb = dbs.staff.db;
  const subscription = await openCheckoutSubscription(staffDb, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: "fake_sub_cccccccccccccccccccccccc",
    referralCodeId: codeId,
    discountAmountCents,
    replacing: null,
    now: NOW,
  });
  await staffDb.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan,
      provider: "fake",
      providerPaymentId: "fake_pay_first",
      paidAt: NOW,
      discountAmountCents,
    }),
  );
  return subscription;
}

async function payRenewal(subscription: Subscription, providerPaymentId: string): Promise<void> {
  const plan = await requirePlan();
  await dbs.staff.db.transaction((tx) =>
    activateRenewalPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      commitmentEndsAt: addMonths(NOW, plan.initialTermMonths),
      provider: "fake",
      providerPaymentId,
      amountCents: chargedAmountCents(plan.recurringAmountCents, subscription.discountAmountCents, plan.taxRateBasisPoints),
      currency: "INR",
      paidAt: addMonths(NOW, 1),
      paidThroughAt: addMonths(NOW, 2),
      periodStart: addMonths(NOW, 1),
      invoicedPrice: {
        plan,
        netAmountCents: plan.recurringAmountCents,
        discountAmountCents: subscription.discountAmountCents,
        retentionDiscountCents: subscription.retentionDiscountCents,
      },
    }),
  );
}

describe("a member paying with an affiliate code", () => {
  it("is charged the discounted amount, activated on it, and earns the affiliate a month", async () => {
    const staffDb = dbs.staff.db;
    const plan = await requirePlan();
    // ₹2,999 a month, with 18% GST on top.
    expect(plan).toMatchObject({ initialAmountCents: 299_900, taxRateBasisPoints: 1_800 });

    // 1. The superadmin creates an affiliate on ₹200 a month, and a ₹500 code for them.
    const affiliateId = await seedAffiliate();
    const codeId = await seedCode("FRIEND15", affiliateId, { kind: "amount", amountCents: 50_000 });

    // 2. The member types it on /premium. Apply normalises, looks it up, and stores it.
    const typed = normaliseReferralCode("  friend15 ");
    expect(typed).toBe("FRIEND15");
    const redeemable = await findRedeemableReferralCode(staffDb, { code: typed ?? "", currency: "INR", now: NOW });
    expect(redeemable?.id).toBe(codeId);
    await setBusinessReferralCode(staffDb, { businessId, referralCodeId: codeId });
    expect(await findBusinessReferralCode(staffDb, businessId)).toMatchObject({ code: "FRIEND15", affiliateId });

    // 3. Pressing Pay: the code's own amount is frozen onto the subscription; a flat code resolves to itself.
    const discountAmountCents =
      redeemable?.discount == null ? 0 : discountCentsFor(redeemable.discount, plan.initialAmountCents);
    expect(discountAmountCents).toBe(50_000);

    const state = await findBillingState(staffDb, businessId);
    const decision = decideCheckout(
      state?.subscription == null ? null : { ...state.subscription, bundleKey: "" },
      { planId: plan.id, provider: "fake", referralCodeId: codeId, bundleKey: "" },
      NOW,
      { paymentUnderReview: false },
    );
    expect(decision.kind).toBe("create");

    const provider = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
    const started = await provider.startCheckout({
      businessId,
      businessName: "Curry Cook",
      email: "owner@currycook.test",
      plan,
      discountAmountCents,
    });
    const subscription = await openCheckoutSubscription(staffDb, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: started.providerSubscriptionId,
      referralCodeId: codeId,
      discountAmountCents,
      replacing: null,
      now: NOW,
    });
    expect(subscription).toMatchObject({ status: "incomplete", discountAmountCents: 50_000 });

    // 4. The provider quotes the discount before GST: ₹2,999 − ₹500 = ₹2,499, plus 18% = ₹2,948.82.
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    const confirmed = await provider.confirmCheckout({ token });
    expect(confirmed.amountCents).toBe(294_882);

    // 5. The member pays, through the same activation the webhook uses.
    const pay = () =>
      staffDb.transaction((tx) =>
        activateFirstPayment(tx, {
          businessId,
          subscriptionId: subscription.id,
          plan,
          provider: "fake",
          providerPaymentId: confirmed.providerPaymentId,
          paidAt: NOW,
          discountAmountCents: subscription.discountAmountCents,
        }),
      );
    await pay();

    const activated = await findLatestSubscriptionForBusiness(staffDb, businessId);
    expect(activated).toMatchObject({ status: "active", referralCodeId: codeId, discountAmountCents: 50_000 });
    expect(activated?.paidThroughAt).toEqual(addMonths(NOW, plan.initialTermMonths));
    const recorded = await listPaymentsForBusiness(staffDb, businessId, 10);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ amountCents: 294_882, kind: "initial", status: "captured" });

    // 6. The affiliate earned their ₹200 for this payment, owed until staff pay it out.
    const earnings = await listAffiliateEarnings(staffDb, affiliateId, 10);
    expect(earnings).toMatchObject([
      { amountCents: 20_000, currency: "INR", basisCents: 249_900, status: "owed", code: "FRIEND15", paymentKind: "initial" },
    ]);

    // 7. The same payment delivered again (a webhook retry) earns nothing more.
    await pay();
    expect(await listAffiliateEarnings(staffDb, affiliateId, 10)).toHaveLength(1);

    // 8. Every renewal earns another month.
    if (activated === null) throw new Error("The subscription was not activated");
    await payRenewal(activated, "fake_pay_renewal_1");
    const afterRenewal = await listAffiliateEarnings(staffDb, affiliateId, 10);
    expect(afterRenewal).toHaveLength(2);
    expect(afterRenewal[0]).toMatchObject({ amountCents: 20_000, paymentKind: "renewal" });
  });

  it("earns a percentage of what the member pays before GST, after their discount", async () => {
    const affiliateId = await seedAffiliate({ kind: "percent", basisPoints: 500 });
    const plan = await requirePlan();
    const codeId = await seedCode("TENPCT", affiliateId, { kind: "percent", basisPoints: 1_000 });
    // 10% of ₹2,999 is ₹299.90, worked out once at checkout and frozen.
    const discountAmountCents = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, plan.initialAmountCents);
    expect(discountAmountCents).toBe(29_990);
    await payFirstMonth(codeId, discountAmountCents);
    // 5% of ₹2,699.10, rounded down to ₹134.95.
    expect(await listAffiliateEarnings(dbs.staff.db, affiliateId, 10)).toMatchObject([
      { amountCents: 13_495, basisCents: 269_910 },
    ]);
  });

  it("charges the full price on an affiliate code that gives no discount, and still earns", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedCode("PRIYA", affiliateId, null);
    await payFirstMonth(codeId, 0);
    const recorded = await listPaymentsForBusiness(dbs.staff.db, businessId, 10);
    // ₹2,999 plus 18% GST.
    expect(recorded[0]).toMatchObject({ amountCents: 353_882 });
    expect(await listAffiliateEarnings(dbs.staff.db, affiliateId, 10)).toMatchObject([
      { amountCents: 20_000, basisCents: 299_900 },
    ]);
  });

  it("earns at the new rate after the reward changes, leaving earlier earnings and the discount alone", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedCode("FRIEND15", affiliateId, { kind: "amount", amountCents: 50_000 });
    const subscription = await payFirstMonth(codeId, 50_000);

    await updateAffiliate(dbs.staff.db, {
      id: affiliateId,
      name: "Asha Nair",
      email: "asha@example.com",
      phone: null,
      reward: { kind: "percent", basisPoints: 750 },
      rewardCurrency: null,
      rewardCycles: null,
      notes: null,
      active: true,
    });
    await payRenewal(subscription, "fake_pay_renewal_1");

    // 7.5% of the recurring ₹2,999 less the frozen ₹500, rounded down: ₹187.42.
    const [renewal, first] = await listAffiliateEarnings(dbs.staff.db, affiliateId, 10);
    expect(renewal).toMatchObject({ amountCents: 18_742, paymentKind: "renewal" });
    expect(first).toMatchObject({ amountCents: 20_000, paymentKind: "initial" });
    const still = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    expect(still?.discountAmountCents).toBe(50_000);
  });
});

describe("an affiliate paid for a limited number of months", () => {
  it("earns on the member's first months only, while the member keeps the discount every month", async () => {
    const affiliateId = await seedAffiliate(AFFILIATE_REWARD, 2);
    const codeId = await seedCode("FRIEND15", affiliateId, { kind: "amount", amountCents: 50_000 });
    const subscription = await payFirstMonth(codeId, 50_000);
    await payRenewal(subscription, "fake_pay_renewal_1");
    await payRenewal(subscription, "fake_pay_renewal_2");

    const earnings = await listAffiliateEarnings(dbs.staff.db, affiliateId, 10);
    // Months 1 and 2 earn; month 3 does not.
    expect(earnings.map((earning) => earning.cycleNumber).sort()).toEqual([1, 2]);
    // The member was charged the discounted price for all three months.
    const paid = await listPaymentsForBusiness(dbs.staff.db, businessId, 10);
    expect(paid).toHaveLength(3);
    for (const payment of paid) expect(payment.amountCents).toBe(294_882);
  });

  it("does not count a refunded month, whose earning staff cancelled, against the limit", async () => {
    const affiliateId = await seedAffiliate(AFFILIATE_REWARD, 2);
    const codeId = await seedCode("FRIEND15", affiliateId, { kind: "amount", amountCents: 50_000 });
    const subscription = await payFirstMonth(codeId, 50_000);
    const [first] = await listAffiliateEarnings(dbs.staff.db, affiliateId, 10);
    await cancelAffiliateEarning(dbs.staff.db, { affiliateId, earningId: first?.id ?? "", staffUserId: STAFF_USER, now: NOW });

    await payRenewal(subscription, "fake_pay_renewal_1");
    await payRenewal(subscription, "fake_pay_renewal_2");
    const owed = (await listAffiliateEarnings(dbs.staff.db, affiliateId, 10)).filter((earning) => earning.status === "owed");
    expect(owed.map((earning) => earning.cycleNumber).sort()).toEqual([1, 2]);
  });
});

describe("a member paying with a coupon", () => {
  it("gets the discount and earns nobody anything", async () => {
    const codeId = await seedCode("LAUNCH500", null, { kind: "amount", amountCents: 50_000 });
    await payFirstMonth(codeId, 50_000);
    const recorded = await listPaymentsForBusiness(dbs.staff.db, businessId, 10);
    expect(recorded[0]).toMatchObject({ amountCents: 294_882 });
    const affiliateId = await seedAffiliate();
    expect(await listAffiliateEarnings(dbs.staff.db, affiliateId, 10)).toEqual([]);
  });

  it("charges the full price when no code is applied", async () => {
    const plan = await requirePlan();
    const provider = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
    const started = await provider.startCheckout({
      businessId,
      businessName: "Curry Cook",
      email: "owner@currycook.test",
      plan,
    });
    const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
    // ₹2,999 plus 18% GST.
    await expect(provider.confirmCheckout({ token })).resolves.toMatchObject({ amountCents: 353_882 });
  });

  it("stops discounting once the coupon is turned off, without touching anyone already paying on it", async () => {
    const staffDb = dbs.staff.db;
    const plan = await requirePlan();
    const codeId = await seedCode("FRIEND15", null, { kind: "amount", amountCents: 50_000 });
    await openCheckoutSubscription(staffDb, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_aaaaaaaaaaaaaaaaaaaaaaaa",
      referralCodeId: codeId,
      discountAmountCents: 50_000,
      replacing: null,
      now: NOW,
    });

    await updateReferralCode(staffDb, { id: codeId, active: false, expiresAt: null, maxRedemptions: null });

    // Nobody new can apply it...
    expect(await findRedeemableReferralCode(staffDb, { code: "FRIEND15", currency: "INR", now: NOW })).toBeNull();
    // ...but the discount already frozen onto this subscription is untouched.
    const still = await findLatestSubscriptionForBusiness(staffDb, businessId);
    expect(still).toMatchObject({ referralCodeId: codeId, discountAmountCents: 50_000 });
  });
});
