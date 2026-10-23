import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmKeptSubscription,
  findActivePlan,
  findBillingState,
  findCurrentPaymentMethod,
  findLatestPaymentMethod,
  findLatestSubscriptionForBusiness,
  findSubscriptionByProviderId,
  findWaitingSuccessor,
  insertSubscription,
  InvalidAmountError,
  listPaymentsForBusiness,
  listReceiptsForBusiness,
  openKeptSubscription,
  recordPaymentAndActivate,
  SubscriptionNotFoundError,
  updateSubscriptionProviderStatus,
  type PaymentMethodDetails,
  type Plan,
} from "./queries/billing";
import { findLiveBundledAddOns } from "./queries/bundled-add-ons";
import { bundledAddOns, businesses, businessMembers, payments, plans, subscriptions, users } from "./schema";
import { withTenantScope } from "./scope";
import {
  captureErrorText,
  openTestDatabases,
  resetTestDatabase,
  seedPlansFromMigrations,
  type TestDatabases,
} from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";
const PAID_AT = new Date("2026-03-01T10:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** What the website alone is charged, tax included: its line is the whole charge, since the plan row costs nothing. */
const WEBSITE_CHARGED_CENTS = { USD: 7_500, INR: 353_882 } as const;

async function requirePlan(currency: "USD" | "INR"): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, currency, "managed");
  if (plan === null) throw new Error(`No active ${currency} plan was seeded`);
  return plan;
}

/** A business that has been sent to the provider but has not paid: an `incomplete` subscription and no access. */
async function openSubscription(
  businessId: string,
  providerSubscriptionId = "fake_sub_a",
): Promise<{ readonly subscriptionId: string; readonly plan: Plan }> {
  const plan = await requirePlan("USD");
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
  });
  return { subscriptionId: subscription.id, plan };
}

function activationFor(
  businessId: string,
  subscriptionId: string,
  plan: Plan,
  providerPaymentId: string,
): Parameters<typeof recordPaymentAndActivate>[1] {
  const termEnd = addMonths(PAID_AT, plan.initialTermMonths);
  return {
    businessId,
    subscriptionId,
    provider: "fake",
    providerPaymentId,
    kind: "initial",
    amountCents: WEBSITE_CHARGED_CENTS[plan.currency],
    currency: plan.currency,
    paidAt: PAID_AT,
    paidThroughAt: termEnd,
    commitmentEndsAt: termEnd,
    currentPeriodEnd: termEnd,
  };
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
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing", currency: "USD" },
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-plumbing");
  businessB = idForSlug(inserted, "chennai-cafe");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
});

describe("plans", () => {
  it("has one active plan per currency, the services plan in rupees and in dollars", async () => {
    const rows = await dbs.owner.db
      .select({ code: plans.code, currency: plans.currency, tier: plans.tier, active: plans.active, name: plans.name })
      .from(plans)
      .orderBy(asc(plans.code));
    expect(rows).toEqual([
      { code: "services-inr-2026-10", currency: "INR", tier: "managed", active: true, name: "Brandbasket services" },
      { code: "services-usd-2026-10", currency: "USD", tier: "managed", active: true, name: "Brandbasket services" },
    ]);
  });

  it("prices every business from the services plan, whatever it chose at sign-up", async () => {
    await dbs.owner.db.update(businesses).set({ signupChoice: "listing_only" }).where(eq(businesses.id, businessB));
    expect(await findBillingState(dbs.staff.db, businessB)).toMatchObject({ tier: "managed", plan: { code: "services-inr-2026-10" } });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ tier: "managed", plan: { code: "services-usd-2026-10" } });
  });

  it("finds the plan for a currency and never the other one", async () => {
    const usd = await requirePlan("USD");
    const inr = await requirePlan("INR");

    // Both cost nothing of their own (the services are the lines) and cover one month: no tax of ours in dollars, and 18%
    // GST on top in rupees.
    expect(usd).toMatchObject({ code: "services-usd-2026-10", currency: "USD", initialAmountCents: 0, taxRateBasisPoints: 0, initialTermMonths: 1, recurringAmountCents: 0 });
    expect(inr).toMatchObject({
      code: "services-inr-2026-10",
      currency: "INR",
      initialAmountCents: 0,
      taxRateBasisPoints: 1800,
      initialTermMonths: 1,
      recurringAmountCents: 0,
      extraPublishAmountCents: 30000,
      includedChangeHours: 1,
      extraHourAmountCents: 50000,
      includedBlogPosts: 100,
      blogPostBlockSize: 100,
      extraBlogPostsAmountCents: 47500,
    });
    for (const amount of [usd.initialAmountCents, usd.recurringAmountCents, inr.initialAmountCents, inr.recurringAmountCents]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it("allows only one active plan per currency and tier, but any number of retired ones", async () => {
    const duplicate = {
      name: "Managed Website",
      currency: "USD" as const,
      initialAmountCents: 30000,
      taxRateBasisPoints: 0,
      initialTermMonths: 3,
      recurringAmountCents: 10000,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 300,
    };

    const message = await captureErrorText(dbs.owner.db.insert(plans).values({ ...duplicate, code: "managed-usd-2" }));
    expect(message).toMatch(/plans_currency_tier_active_idx/);

    await dbs.owner.db.insert(plans).values([
      { ...duplicate, code: "managed-usd-old-1", active: false },
      { ...duplicate, code: "managed-usd-old-2", active: false },
    ]);
    // The live price is still the only one found.
    expect(await findActivePlan(dbs.staff.db, "USD", "managed")).toMatchObject({ code: "services-usd-2026-10", initialAmountCents: 0 });
  });

  it("returns null once a currency has no active plan, rather than a retired price", async () => {
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.code, "services-usd-2026-10"));

    expect(await findActivePlan(dbs.staff.db, "USD", "managed")).toBeNull();
    expect(await findActivePlan(dbs.staff.db, "INR", "managed")).not.toBeNull();
  });
});

describe("one live subscription per business", () => {
  it("refuses a second subscription that is not cancelled", async () => {
    const plan = await requirePlan("USD");
    await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_1",
    });

    const message = await captureErrorText(
      insertSubscription(dbs.staff.db, {
        businessId: businessA,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: "fake_sub_2",
      }),
    );

    expect(message).toMatch(/subscriptions_one_live_per_business_idx/);
    expect(await dbs.staff.db.select({ id: subscriptions.id }).from(subscriptions)).toHaveLength(1);
  });

  it("lets a business start again once the old subscription is cancelled, and stacks cancelled ones", async () => {
    const plan = await requirePlan("USD");
    const first = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_1",
    });
    await dbs.staff.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: PAID_AT })
      .where(eq(subscriptions.id, first.id));

    const second = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_2",
    });
    await dbs.staff.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: PAID_AT })
      .where(eq(subscriptions.id, second.id));
    const third = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_3",
    });

    expect(await dbs.staff.db.select({ id: subscriptions.id }).from(subscriptions)).toHaveLength(3);
    // Only the live one is what the access rule reads.
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      id: third.id,
      status: "incomplete",
    });
  });

  it("does not confuse one business's subscription with another's", async () => {
    const plan = await requirePlan("USD");
    const mine = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_a",
    });
    await insertSubscription(dbs.staff.db, {
      businessId: businessB,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_b",
    });

    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ id: mine.id });
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
  });
});

describe("recordPaymentAndActivate", () => {
  it("records the payment and opens the subscription in one go", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);

    const result = await recordPaymentAndActivate(
      dbs.staff.db,
      activationFor(businessA, subscriptionId, plan, "fake_pay_1"),
    );

    expect(result.alreadyRecorded).toBe(false);
    expect(result.payment).toMatchObject({
      businessId: businessA,
      subscriptionId,
      provider: "fake",
      providerPaymentId: "fake_pay_1",
      kind: "initial",
      amountCents: 7500,
      currency: "USD",
      status: "captured",
    });

    const termEnd = addMonths(PAID_AT, 1);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      status: "active",
      activatedAt: PAID_AT,
      commitmentEndsAt: termEnd,
      paidThroughAt: termEnd,
      currentPeriodEnd: termEnd,
    });
    expect(plan.initialTermMonths).toBe(1);
  });

  it("unlocks exactly one month for an INR payment, because the term comes from the plan", async () => {
    const plan = await requirePlan("INR");
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId: businessB,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_inr",
    });

    const result = await recordPaymentAndActivate(
      dbs.staff.db,
      activationFor(businessB, subscription.id, plan, "fake_pay_inr"),
    );

    const oneMonthOn = new Date("2026-04-01T10:00:00.000Z");
    expect(plan.initialTermMonths).toBe(1);
    expect(result.payment).toMatchObject({ amountCents: 353_882, currency: "INR", kind: "initial" });
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessB)).toMatchObject({
      status: "active",
      commitmentEndsAt: oneMonthOn,
      paidThroughAt: oneMonthOn,
      currentPeriodEnd: oneMonthOn,
    });
  });

  it("records one payment and moves no date when the same provider payment arrives twice", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);
    const activation = activationFor(businessA, subscriptionId, plan, "fake_pay_1");

    const first = await recordPaymentAndActivate(dbs.staff.db, activation);
    const afterFirst = await findLatestSubscriptionForBusiness(dbs.staff.db, businessA);

    // The same delivery again, as a webhook retry or a refreshed confirm page would send it, with dates that
    // would otherwise buy the customer another free term.
    const second = await recordPaymentAndActivate(dbs.staff.db, {
      ...activation,
      paidThroughAt: addMonths(PAID_AT, 12),
      commitmentEndsAt: addMonths(PAID_AT, 12),
      currentPeriodEnd: addMonths(PAID_AT, 12),
    });

    expect(second.alreadyRecorded).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(1);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toEqual(afterFirst);
  });

  it("keeps the first activation date when a later payment extends the term", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);
    await recordPaymentAndActivate(dbs.staff.db, activationFor(businessA, subscriptionId, plan, "fake_pay_1"));

    const renewalEnd = addMonths(PAID_AT, 2);
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_2"),
      kind: "renewal",
      amountCents: WEBSITE_CHARGED_CENTS[plan.currency],
      paidAt: addMonths(PAID_AT, 1),
      paidThroughAt: renewalEnd,
      currentPeriodEnd: renewalEnd,
    });

    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      status: "active",
      activatedAt: PAID_AT,
      paidThroughAt: renewalEnd,
    });
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(2);
  });

  it("writes nothing when the subscription does not belong to the business paying", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);

    await expect(
      recordPaymentAndActivate(dbs.staff.db, activationFor(businessB, subscriptionId, plan, "fake_pay_1")),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);

    // The payment insert rolled back with the failed activation: no money recorded against a locked subscription.
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(0);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({ status: "incomplete" });
  });

  it("refuses an amount that is not whole minor units, before it reaches the database", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);

    await expect(
      recordPaymentAndActivate(dbs.staff.db, {
        ...activationFor(businessA, subscriptionId, plan, "fake_pay_1"),
        amountCents: 225.5,
      }),
    ).rejects.toBeInstanceOf(InvalidAmountError);
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(0);
  });

  it("lists a business's payments newest first", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);
    await recordPaymentAndActivate(dbs.staff.db, activationFor(businessA, subscriptionId, plan, "fake_pay_1"));
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_2"),
      kind: "renewal",
      amountCents: WEBSITE_CHARGED_CENTS[plan.currency],
    });

    const listed = await listPaymentsForBusiness(dbs.staff.db, businessA, 10);
    expect(listed.map((payment) => payment.providerPaymentId)).toEqual(["fake_pay_2", "fake_pay_1"]);
    expect(listed.map((payment) => payment.amountCents)).toEqual([7500, 7500]);
    expect(await listPaymentsForBusiness(dbs.staff.db, businessB, 10)).toEqual([]);
  });
});

describe("what the customer's connection may do with billing rows", () => {
  async function payFor(businessId: string, providerSuffix: string): Promise<string> {
    const { subscriptionId, plan } = await openSubscription(businessId, `fake_sub_${providerSuffix}`);
    await recordPaymentAndActivate(
      dbs.staff.db,
      activationFor(businessId, subscriptionId, plan, `fake_pay_${providerSuffix}`),
    );
    return subscriptionId;
  }

  it("reads its own subscription and payments", async () => {
    const subscriptionId = await payFor(businessA, "a");

    const seen = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => ({
      subscription: await findLatestSubscriptionForBusiness(tx, businessA),
      payments: await listPaymentsForBusiness(tx, businessA, 10),
      plan: await findActivePlan(tx, "USD", "managed"),
    }));

    expect(seen.subscription).toMatchObject({ id: subscriptionId, status: "active" });
    expect(seen.payments.map((payment) => payment.providerPaymentId)).toEqual(["fake_pay_a"]);
    // Prices are the same for everyone, so the payment screen can read the plan.
    expect(seen.plan).toMatchObject({ code: "services-usd-2026-10" });
  });

  it("cannot read another tenant's subscription or payments", async () => {
    await payFor(businessA, "a");

    const seen = await withTenantScope(dbs.app.db, { userId: USER_B, businessId: businessB }, async (tx) => ({
      byHelper: await findLatestSubscriptionForBusiness(tx, businessA),
      everything: await tx.select({ id: subscriptions.id }).from(subscriptions),
      payments: await tx.select({ id: payments.id }).from(payments),
    }));

    expect(seen.byHelper).toBeNull();
    expect(seen.everything).toEqual([]);
    expect(seen.payments).toEqual([]);
  });

  it("sees nothing at all outside a tenant-scoped transaction", async () => {
    await payFor(businessA, "a");

    expect(await dbs.app.db.select({ id: subscriptions.id }).from(subscriptions)).toEqual([]);
    expect(await dbs.app.db.select({ id: payments.id }).from(payments)).toEqual([]);
  });

  it("cannot insert or update a subscription, even its own", async () => {
    const subscriptionId = await payFor(businessA, "a");
    const scope = { userId: USER_A, businessId: businessA };
    const plan = await requirePlan("USD");

    const inserted = await captureErrorText(
      withTenantScope(dbs.app.db, scope, (tx) =>
        tx.insert(subscriptions).values({
          businessId: businessA,
          planId: plan.id,
          provider: "fake",
          providerSubscriptionId: "fake_sub_forged",
        }),
      ),
    );
    const updated = await captureErrorText(
      withTenantScope(dbs.app.db, scope, (tx) =>
        tx
          .update(subscriptions)
          .set({ paidThroughAt: addMonths(PAID_AT, 120) })
          .where(eq(subscriptions.id, subscriptionId)),
      ),
    );

    expect(inserted).toMatch(/permission denied for table subscriptions/);
    expect(updated).toMatch(/permission denied for table subscriptions/);
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      paidThroughAt: addMonths(PAID_AT, 1),
    });
  });

  it("cannot insert or update a payment, and cannot rewrite a plan's price", async () => {
    const subscriptionId = await payFor(businessA, "a");
    const scope = { userId: USER_A, businessId: businessA };
    const plan = await requirePlan("USD");

    const insertedPayment = await captureErrorText(
      withTenantScope(dbs.app.db, scope, (tx) =>
        tx.insert(payments).values({
          businessId: businessA,
          subscriptionId,
          provider: "fake",
          providerPaymentId: "fake_pay_forged",
          kind: "initial",
          amountCents: 1,
          currency: "USD",
          status: "captured",
        }),
      ),
    );
    const updatedPayment = await captureErrorText(
      withTenantScope(dbs.app.db, scope, (tx) => tx.update(payments).set({ amountCents: 1 })),
    );
    const updatedPlan = await captureErrorText(
      withTenantScope(dbs.app.db, scope, (tx) =>
        tx.update(plans).set({ initialAmountCents: 1 }).where(eq(plans.id, plan.id)),
      ),
    );

    expect(insertedPayment).toMatch(/permission denied for table payments/);
    expect(updatedPayment).toMatch(/permission denied for table payments/);
    expect(updatedPlan).toMatch(/permission denied for table plans/);
    expect(await listPaymentsForBusiness(dbs.staff.db, businessA, 10)).toHaveLength(1);
  });
});

describe("findCurrentPaymentMethod", () => {
  /** A payment row written straight to the table, so a test can say exactly when it was made and how. */
  async function insertPayment(values: Partial<typeof payments.$inferInsert> & { providerPaymentId: string; createdAt: Date }): Promise<void> {
    await dbs.staff.db.insert(payments).values({
      businessId: businessA,
      provider: "razorpay",
      kind: "renewal",
      amountCents: 299900,
      currency: "INR",
      status: "captured",
      paidAt: values.createdAt,
      ...values,
    });
  }

  function readAsOwner(planOnly = false): ReturnType<typeof findCurrentPaymentMethod> {
    return withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, (tx) =>
      findCurrentPaymentMethod(tx, businessA, { planOnly }),
    );
  }

  /** A card renewal, then a payment staff recorded by hand as a one-off charge. */
  async function insertRenewalThenManualCharge(): Promise<void> {
    await insertPayment({
      providerPaymentId: "pay_card_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
    });
    await insertPayment({
      providerPaymentId: "manual-charge-1",
      createdAt: new Date("2026-05-10T10:00:00.000Z"),
      provider: "manual",
      kind: "charge",
      manualReference: "NEFT 7781",
      receivedOn: "2026-05-10",
      recordedByStaffId: USER_A,
    });
  }

  it("gives the card of a renewal made after an older bank transfer", async () => {
    await insertPayment({
      providerPaymentId: "bank-ref-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      provider: "manual",
      kind: "initial",
      manualReference: "NEFT 0921",
      receivedOn: "2026-04-01",
      recordedByStaffId: USER_A,
    });
    await insertPayment({
      providerPaymentId: "pay_card_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
      cardType: "credit",
      cardIssuer: "HDFC",
    });

    expect(await readAsOwner()).toEqual({
      provider: "razorpay",
      kind: "renewal",
      method: "card",
      cardNetwork: "Visa",
      cardType: "credit",
      cardLast4: "4366",
      upiVpa: null,
      manualReference: null,
      paidAt: new Date("2026-05-01T10:00:00.000Z"),
    });
  });

  it("gives a bank transfer staff recorded, with its reference, when it is the only payment", async () => {
    await insertPayment({
      providerPaymentId: "bank-ref-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      provider: "manual",
      kind: "initial",
      manualReference: "NEFT 0921",
      receivedOn: "2026-04-01",
      recordedByStaffId: USER_A,
    });

    expect(await readAsOwner()).toMatchObject({ provider: "manual", method: null, manualReference: "NEFT 0921" });
  });

  it("is null when the only payment failed, and for a business with no payments", async () => {
    await insertPayment({
      providerPaymentId: "pay_failed_1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      status: "failed",
      paidAt: null,
      failureReason: "Card declined",
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
    });

    expect(await readAsOwner()).toBeNull();
    expect(await withTenantScope(dbs.app.db, { userId: USER_B, businessId: businessB }, (tx) => findCurrentPaymentMethod(tx, businessB, { planOnly: false }))).toBeNull();
  });

  it("skips a newer payment that bought nothing, such as a duplicate", async () => {
    await insertPayment({
      providerPaymentId: "pay_card_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
    });
    await insertPayment({
      providerPaymentId: "pay_upi_dup",
      createdAt: new Date("2026-05-02T10:00:00.000Z"),
      method: "upi",
      upiVpa: "ana@okhdfc",
      attentionReason: "already_paid",
      attentionRaisedAt: new Date("2026-05-02T10:00:01.000Z"),
    });

    expect(await readAsOwner()).toMatchObject({ method: "card", cardLast4: "4366" });
  });

  it("gives the plan's card, not a staff-recorded charge made after it, when only plan payments count", async () => {
    await insertRenewalThenManualCharge();

    expect(await readAsOwner(true)).toMatchObject({ provider: "razorpay", kind: "renewal", method: "card", cardLast4: "4366" });
  });

  it("gives the plan's card, not a card used for a paid extra made after it, when only plan payments count", async () => {
    await insertPayment({
      providerPaymentId: "pay_card_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
    });
    await insertPayment({
      providerPaymentId: "pay_extra_1",
      createdAt: new Date("2026-05-10T10:00:00.000Z"),
      kind: "extra_publish",
      method: "card",
      cardNetwork: "Mastercard",
      cardLast4: "1111",
    });

    expect(await readAsOwner(true)).toMatchObject({ kind: "renewal", cardNetwork: "Visa", cardLast4: "4366" });
  });

  it("still gives the newest payment of any kind when plan payments do not have to be the only ones", async () => {
    await insertRenewalThenManualCharge();

    expect(await readAsOwner(false)).toMatchObject({ provider: "manual", kind: "charge", manualReference: "NEFT 7781" });
  });

  it("counts a reactivation as a plan payment", async () => {
    await insertPayment({
      providerPaymentId: "pay_react_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      kind: "reactivation",
      method: "upi",
      upiVpa: "ana@okhdfc",
    });

    expect(await readAsOwner(true)).toMatchObject({ kind: "reactivation", upiVpa: "ana@okhdfc" });
  });

  it("never shows another business's payment method", async () => {
    await insertPayment({
      providerPaymentId: "pay_card_1",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
    });

    const seen = await withTenantScope(dbs.app.db, { userId: USER_B, businessId: businessB }, (tx) =>
      findCurrentPaymentMethod(tx, businessA, { planOnly: false }),
    );

    expect(seen).toBeNull();
  });
});

describe("updateSubscriptionProviderStatus", () => {
  async function openActiveRazorpaySubscription(businessId: string): Promise<{ readonly providerSubscriptionId: string; readonly paidThroughAt: Date }> {
    const providerSubscriptionId = "razorpay_sub_a";
    const plan = await requirePlan("USD");
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "razorpay",
      providerSubscriptionId,
    });
    const paidThroughAt = addMonths(PAID_AT, plan.initialTermMonths);
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "razorpay",
      providerPaymentId: "razorpay_pay_a",
      kind: "initial",
      amountCents: WEBSITE_CHARGED_CENTS[plan.currency],
      currency: plan.currency,
      paidAt: PAID_AT,
      paidThroughAt,
      commitmentEndsAt: paidThroughAt,
      currentPeriodEnd: paidThroughAt,
    });
    return { providerSubscriptionId, paidThroughAt };
  }

  it("updates status, providerStatus and lastSyncedAt without touching paidThroughAt", async () => {
    const { providerSubscriptionId, paidThroughAt } = await openActiveRazorpaySubscription(businessA);
    const now = new Date();

    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "inactive",
      providerStatus: "halted",
      now,
    });
    expect(updated).toBe(true);

    const found = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", providerSubscriptionId);
    expect(found?.status).toBe("inactive");
    expect(found?.providerStatus).toBe("halted");
    expect(found?.paidThroughAt).toEqual(paidThroughAt); // unchanged

    // lastSyncedAt is not on the exported Subscription type, so it is read back directly here.
    const [row] = await dbs.staff.db
      .select({ lastSyncedAt: subscriptions.lastSyncedAt })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId));
    expect(row?.lastSyncedAt).toEqual(now);
  });

  it("sets cancelledAt once and does not move it on a repeat event", async () => {
    const { providerSubscriptionId } = await openActiveRazorpaySubscription(businessA);
    const first = new Date();
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: first,
    });
    const second = new Date(first.getTime() + 60_000);
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: second,
    });
    const found = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", providerSubscriptionId);
    expect(found?.cancelledAt).toEqual(first);
  });

  it("returns false for a subscription id it does not know", async () => {
    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId: "sub_unknown",
      status: "inactive",
      providerStatus: "halted",
      now: new Date(),
    });
    expect(updated).toBe(false);
  });

  it("never moves a cancelled subscription to another status, even for a stray webhook", async () => {
    const { providerSubscriptionId } = await openActiveRazorpaySubscription(businessA);
    await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "cancelled",
      providerStatus: "cancelled",
      now: new Date(),
    });

    // A stray or out-of-order webhook reporting a live status for this now-superseded subscription must not
    // resurrect it: subscriptions_one_live_per_business_idx would refuse it anyway if it were sharing a business
    // with a newer live subscription, but this must not even attempt the flip.
    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId,
      status: "active",
      providerStatus: "active",
      now: new Date(),
    });

    expect(updated).toBe(false);
    const found = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", providerSubscriptionId);
    expect(found?.status).toBe("cancelled");
  });

  it("matches on provider and providerSubscriptionId together, not either alone", async () => {
    const plan = await requirePlan("USD");
    const fakeSubscription = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "shared_id",
    });
    await insertSubscription(dbs.staff.db, {
      businessId: businessB,
      planId: plan.id,
      provider: "razorpay",
      providerSubscriptionId: "shared_id",
    });

    const updated = await updateSubscriptionProviderStatus(dbs.staff.db, {
      provider: "razorpay",
      providerSubscriptionId: "shared_id",
      status: "inactive",
      providerStatus: "halted",
      now: new Date(),
    });

    expect(updated).toBe(true);
    const razorpayRow = await findSubscriptionByProviderId(dbs.staff.db, "razorpay", "shared_id");
    expect(razorpayRow?.status).toBe("inactive");
    const fakeRow = await findSubscriptionByProviderId(dbs.staff.db, "fake", "shared_id");
    expect(fakeRow?.id).toBe(fakeSubscription.id);
    expect(fakeRow?.status).toBe("incomplete");
  });
});

describe("how a payment was made, and receipt numbers", () => {
  const VISA: PaymentMethodDetails = {
    method: "card",
    cardNetwork: "Visa",
    cardLast4: "1234",
    cardType: "debit",
    cardIssuer: "HDFC",
    upiVpa: null,
  };
  const UPI: PaymentMethodDetails = {
    method: "upi",
    cardNetwork: null,
    cardLast4: null,
    cardType: null,
    cardIssuer: null,
    upiVpa: "ana@okhdfc",
  };

  async function payTwice(): Promise<void> {
    const { subscriptionId, plan } = await openSubscription(businessA);
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_first"),
      method: VISA,
    });
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_second"),
      kind: "renewal",
      method: UPI,
    });
  }

  it("reads back the newest payment's method through the customer's own connection", async () => {
    await payTwice();

    const method = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, (tx) =>
      findLatestPaymentMethod(tx, businessA),
    );

    expect(method).toEqual(UPI);
  });

  it("skips payments that did not record a method", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_first"),
      method: VISA,
    });
    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessA, subscriptionId, plan, "fake_pay_second"),
      kind: "renewal",
    });

    expect(await findLatestPaymentMethod(dbs.staff.db, businessA)).toEqual(VISA);
  });

  it("is null for a business that has never recorded one, and never shows another business's", async () => {
    await payTwice();

    const seen = await withTenantScope(dbs.app.db, { userId: USER_B, businessId: businessB }, (tx) =>
      findLatestPaymentMethod(tx, businessA),
    );

    expect(seen).toBeNull();
    expect(await findLatestPaymentMethod(dbs.staff.db, businessB)).toBeNull();
  });

  it("refuses last four digits that are not four digits", async () => {
    const { subscriptionId, plan } = await openSubscription(businessA);

    const error = await captureErrorText(
      recordPaymentAndActivate(dbs.staff.db, {
        ...activationFor(businessA, subscriptionId, plan, "fake_pay_bad"),
        method: { ...VISA, cardLast4: "12ab" },
      }),
    );

    expect(error).toContain("payments_card_last4_check");
  });

  it("numbers receipts oldest first, and keeps the number when only the newest are read", async () => {
    await payTwice();

    const all = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, (tx) =>
      listReceiptsForBusiness(tx, businessA, 10),
    );
    const newestOnly = await listReceiptsForBusiness(dbs.staff.db, businessA, 1);

    expect(all.map((receipt) => [receipt.providerPaymentId, receipt.sequence])).toEqual([
      ["fake_pay_second", 2],
      ["fake_pay_first", 1],
    ]);
    expect(all[0]).toMatchObject({ planName: expect.any(String), taxRateBasisPoints: 0 });
    expect(newestOnly.map((receipt) => receipt.sequence)).toEqual([2]);
  });
});

describe("a kept plan's successor", () => {
  const RENEWS_AT = addMonths(PAID_AT, 1);
  const LINES = [
    { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 0, netAmountCents: 299_900, taxRateBasisPoints: 1_800 },
  ] as const;

  /** A paid plan the client cancelled at its cycle end, and the new mandate that carries it on. */
  async function cancelledPlanWithSuccessor(): Promise<{ readonly old: string; readonly successor: string; readonly plan: Plan }> {
    const plan = await requirePlan("INR");
    const opened = await insertSubscription(dbs.staff.db, { businessId: businessB, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_old", adCreditCents: 100 });
    await dbs.staff.db.insert(bundledAddOns).values({ businessId: businessB, subscriptionId: opened.id, ...LINES[0], status: "active" });
    await recordPaymentAndActivate(dbs.staff.db, { ...activationFor(businessB, opened.id, plan, "fake_pay_old"), currency: "INR" });
    await dbs.staff.db.update(subscriptions).set({ cancelRequestedAt: PAID_AT }).where(eq(subscriptions.id, opened.id));
    const old = await findLatestSubscriptionForBusiness(dbs.staff.db, businessB);
    if (old === null) throw new Error("The plan was not recorded");
    const successor = await openKeptSubscription(dbs.staff.db, {
      continues: old,
      provider: "fake",
      providerSubscriptionId: "fake_sub_kept",
      bundledAddOns: LINES,
      adCreditCents: 100,
      replacing: null,
      now: PAID_AT,
    });
    return { old: old.id, successor: successor.id, plan };
  }

  it("is opened beside the live plan, starting where its paid month ends, and the old plan stays the business's current one", async () => {
    const { old, successor } = await cancelledPlanWithSuccessor();

    const row = await dbs.owner.db.query.subscriptions.findFirst({ where: eq(subscriptions.id, successor) });
    expect(row).toMatchObject({ continuesId: old, status: "incomplete", startAt: RENEWS_AT, bundledAddOnNetCents: 299_900, adCreditCents: 100 });
    expect((await findLatestSubscriptionForBusiness(dbs.staff.db, businessB))?.id).toBe(old);
    expect((await findWaitingSuccessor(dbs.staff.db, old))?.id).toBe(successor);
    // The lines are the old plan's alone until the successor is charged.
    expect((await findLiveBundledAddOns(dbs.staff.db, businessB)).map((line) => line.subscriptionId)).toEqual([old]);
  });

  it("allows one successor per plan and still only one live plan per business", async () => {
    const { old, plan } = await cancelledPlanWithSuccessor();
    const oldRow = await findLatestSubscriptionForBusiness(dbs.staff.db, businessB);
    if (oldRow === null) throw new Error("The plan was not recorded");

    const second = await captureErrorText(
      openKeptSubscription(dbs.staff.db, { continues: oldRow, provider: "fake", providerSubscriptionId: "fake_sub_kept_2", bundledAddOns: LINES, adCreditCents: 0, replacing: null, now: PAID_AT }),
    );
    expect(second).toContain("subscriptions_one_successor_idx");
    const another = await captureErrorText(insertSubscription(dbs.staff.db, { businessId: businessB, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_other" }));
    expect(another).toContain("subscriptions_one_live_per_business_idx");
    expect(old).toBe(oldRow.id);
  });

  it("replaces an earlier successor that was never authorised", async () => {
    const { old, successor } = await cancelledPlanWithSuccessor();
    const oldRow = await findLatestSubscriptionForBusiness(dbs.staff.db, businessB);
    if (oldRow === null) throw new Error("The plan was not recorded");

    const replacement = await openKeptSubscription(dbs.staff.db, {
      continues: oldRow,
      provider: "fake",
      providerSubscriptionId: "fake_sub_kept_2",
      bundledAddOns: LINES,
      adCreditCents: 100,
      replacing: successor,
      now: PAID_AT,
    });

    expect((await findWaitingSuccessor(dbs.staff.db, old))?.id).toBe(replacement.id);
    expect((await dbs.owner.db.query.subscriptions.findFirst({ where: eq(subscriptions.id, successor) }))?.status).toBe("cancelled");
  });

  it("refuses a continuation with no start day, or a start day with nothing continued", async () => {
    const { old } = await cancelledPlanWithSuccessor();
    const plan = await requirePlan("INR");

    expect(await captureErrorText(dbs.owner.db.update(subscriptions).set({ startAt: null }).where(eq(subscriptions.continuesId, old)))).toContain("subscriptions_keep_check");
    expect(await captureErrorText(insertSubscription(dbs.staff.db, { businessId: businessA, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_x", startAt: RENEWS_AT }))).toContain("subscriptions_keep_check");
  });

  it("is authorised without being charged, which clears the cancel and takes nothing else", async () => {
    const { old, successor } = await cancelledPlanWithSuccessor();

    expect(await confirmKeptSubscription(dbs.staff.db, { subscriptionId: successor, now: PAID_AT })).toEqual({ businessId: businessB, continuesId: old });
    expect(await confirmKeptSubscription(dbs.staff.db, { subscriptionId: old, now: PAID_AT })).toBeNull();

    expect(await dbs.owner.db.query.subscriptions.findFirst({ where: eq(subscriptions.id, successor) })).toMatchObject({ status: "active", activatedAt: null, paidThroughAt: null });
    const current = await findLatestSubscriptionForBusiness(dbs.staff.db, businessB);
    expect(current).toMatchObject({ id: old, cancelRequestedAt: null });
  });

  it("becomes the business's current plan once its first payment is recorded", async () => {
    const { old, successor } = await cancelledPlanWithSuccessor();
    const plan = await requirePlan("INR");

    await recordPaymentAndActivate(dbs.staff.db, {
      ...activationFor(businessB, successor, plan, "fake_pay_kept"),
      kind: "renewal",
      currency: "INR",
      paidAt: RENEWS_AT,
      paidThroughAt: addMonths(RENEWS_AT, 1),
    });

    expect((await findLatestSubscriptionForBusiness(dbs.staff.db, businessB))?.id).toBe(successor);
    expect(await findWaitingSuccessor(dbs.staff.db, old)).toBeNull();
  });
});
