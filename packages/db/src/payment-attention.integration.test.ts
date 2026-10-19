import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findActivePlan,
  findBillingState,
  findFirstPayment,
  findLatestSubscriptionForBusiness,
  flagPaymentForAttention,
  insertSubscription,
  listPaymentsNeedingAttention,
  listReceiptsForBusiness,
  lockBusinessForBilling,
  openCheckoutSubscription,
  recordPaymentAndActivate,
  recordUnappliedPayment,
  resolvePaymentAttention,
  type PaymentActivation,
  type Plan,
  type UnappliedPayment,
} from "./queries/billing";
import { listClients } from "./queries/clients";
import {
  businesses,
  businessMembers,
  leads,
  payments,
  plans,
  staffMembers,
  subscriptions,
  users,
} from "./schema";
import { withTenantScope } from "./scope";
import {
  captureErrorText,
  openTestDatabases,
  resetTestDatabase,
  seedDollarPlanForTests,
  seedPlansFromMigrations,
  type TestDatabases,
} from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";
const STAFF_USER = "staff-1";
const PAID_AT = new Date("2026-09-16T10:00:00.000Z");
const LATER = new Date("2026-09-17T10:00:00.000Z");
const THREE_MONTHS_ON = new Date("2026-12-16T10:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

const scopeA = (): { userId: string; businessId: string } => ({ userId: USER_A, businessId: businessA });

async function usdPlan(): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, "USD", "managed");
  if (plan === null) throw new Error("No USD plan was seeded");
  return plan;
}

async function openCheckout(businessId: string, providerSubscriptionId: string): Promise<string> {
  const plan = await usdPlan();
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
  });
  return subscription.id;
}

async function activation(subscriptionId: string, providerPaymentId: string): Promise<PaymentActivation> {
  const plan = await usdPlan();
  return {
    businessId: businessA,
    subscriptionId,
    provider: "fake",
    providerPaymentId,
    kind: "initial",
    amountCents: plan.initialAmountCents,
    currency: plan.currency,
    paidAt: PAID_AT,
    paidThroughAt: THREE_MONTHS_ON,
    commitmentEndsAt: THREE_MONTHS_ON,
    currentPeriodEnd: THREE_MONTHS_ON,
  };
}

function unapplied(subscriptionId: string, overrides: Partial<UnappliedPayment> = {}): UnappliedPayment {
  return {
    businessId: businessA,
    subscriptionId,
    provider: "fake",
    providerPaymentId: "fake_pay_late",
    kind: "initial",
    amountCents: 22500,
    currency: "USD",
    paidAt: LATER,
    reason: "checkout_replaced",
    now: LATER,
    ...overrides,
  };
}

async function cancel(subscriptionId: string): Promise<void> {
  await dbs.staff.db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: LATER })
    .where(eq(subscriptions.id, subscriptionId));
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
  await seedDollarPlanForTests(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
    { id: STAFF_USER, name: "Sam Staff", email: "sam@brandbasket.example" },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF_USER });
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing", currency: "USD" },
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "riverside-plumbing")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
});

describe("billing state reads the newest subscription, cancelled or not", () => {
  it("keeps a paid subscription visible after it is cancelled", async () => {
    const paid = await openCheckout(businessA, "fake_sub_a");
    await recordPaymentAndActivate(dbs.staff.db, await activation(paid, "fake_pay_a"));
    await cancel(paid);

    const state = await withTenantScope(dbs.app.db, scopeA(), (tx) => findBillingState(tx, businessA));
    expect(state).toMatchObject({
      subscription: { id: paid, status: "cancelled", paidThroughAt: THREE_MONTHS_ON },
      hasEverPaid: true,
      paymentUnderReview: false,
    });

    const clients = await listClients(dbs.staff.db);
    expect(clients.find((client) => client.businessId === businessA)?.billing.subscription).toMatchObject({
      status: "cancelled",
      activatedAt: PAID_AT,
      paidThroughAt: THREE_MONTHS_ON,
    });
  });

  it("reads the replacement, not the checkout it replaced", async () => {
    const plan = await usdPlan();
    const stale = await openCheckout(businessA, "fake_sub_old");
    const fresh = await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_new",
      replacing: stale,
      now: LATER,
    });

    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      id: fresh.id,
      status: "incomplete",
    });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ hasEverPaid: false });
  });

  it("reports a checkout cancelled without a replacement as never paid", async () => {
    const abandoned = await openCheckout(businessA, "fake_sub_a");
    await cancel(abandoned);

    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({
      subscription: { id: abandoned, status: "cancelled", activatedAt: null },
      hasEverPaid: false,
    });
    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, "not-a-uuid")).toBeNull();
  });
});

describe("recordUnappliedPayment", () => {
  it("records the money, flags it, and changes nothing else", async () => {
    const replaced = await openCheckout(businessA, "fake_sub_a");
    await cancel(replaced);
    const [lead] = await dbs.staff.db
      .insert(leads)
      .values({
        name: "Ana",
        businessName: "Riverside",
        email: "ana@example.com",
        phone: "+1 555 0100",
        businessId: businessA,
        status: "account_created",
      })
      .returning({ id: leads.id });

    const first = await recordUnappliedPayment(dbs.staff.db, unapplied(replaced));
    expect(first).toMatchObject({
      alreadyRecorded: false,
      payment: { status: "captured", attentionReason: "checkout_replaced", attentionResolvedAt: null },
    });

    const again = await recordUnappliedPayment(dbs.staff.db, unapplied(replaced));
    expect(again).toMatchObject({ alreadyRecorded: true, payment: { id: first.payment.id } });

    expect(await findLatestSubscriptionForBusiness(dbs.staff.db, businessA)).toMatchObject({
      status: "cancelled",
      activatedAt: null,
      paidThroughAt: null,
    });
    const leadRows = await dbs.staff.db.select({ status: leads.status }).from(leads).where(eq(leads.id, lead?.id ?? ""));
    expect(leadRows[0]?.status).toBe("account_created");
    expect(await findFirstPayment(dbs.staff.db, businessA)).toBeNull();
    // Money that did not apply to a plan does not make the business a client.
    const clients = await listClients(dbs.staff.db);
    expect(clients.find((client) => client.businessId === businessA)).toBeUndefined();

    const state = await withTenantScope(dbs.app.db, scopeA(), (tx) => findBillingState(tx, businessA));
    expect(state).toMatchObject({ hasEverPaid: false, paymentUnderReview: true });
  });

  it("refuses a reason that means the payment applied", async () => {
    const replaced = await openCheckout(businessA, "fake_sub_a");
    await expect(
      recordUnappliedPayment(dbs.staff.db, unapplied(replaced, { reason: "submission_failed" as "already_paid" })),
    ).rejects.toThrow(/Not a reason for an unapplied payment/);
  });

  it("clears the review once staff resolve it, and only once", async () => {
    const replaced = await openCheckout(businessA, "fake_sub_a");
    const { payment } = await recordUnappliedPayment(dbs.staff.db, unapplied(replaced));

    const resolution = { paymentId: payment.id, businessId: businessA, staffUserId: STAFF_USER, now: LATER };
    await expect(resolvePaymentAttention(dbs.staff.db, { ...resolution, businessId: businessB })).resolves.toBe(false);
    await expect(resolvePaymentAttention(dbs.staff.db, resolution)).resolves.toBe(true);
    await expect(resolvePaymentAttention(dbs.staff.db, resolution)).resolves.toBe(false);
    await expect(resolvePaymentAttention(dbs.staff.db, { ...resolution, paymentId: "nope" })).resolves.toBe(false);

    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({ paymentUnderReview: false });
    expect(await listPaymentsNeedingAttention(dbs.staff.db, { limit: 10 })).toEqual([]);
  });
});

describe("flagPaymentForAttention", () => {
  it("flags an applied payment without taking away what it bought", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    const { payment } = await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));

    const flag = { paymentId: payment.id, businessId: businessA, reason: "submission_failed", now: LATER } as const;
    await expect(flagPaymentForAttention(dbs.staff.db, { ...flag, businessId: businessB })).resolves.toBe(false);
    await expect(flagPaymentForAttention(dbs.staff.db, flag)).resolves.toBe(true);
    await expect(flagPaymentForAttention(dbs.staff.db, flag)).resolves.toBe(false);

    expect(await findFirstPayment(dbs.staff.db, businessA)).toMatchObject({
      id: payment.id,
      attentionReason: "submission_failed",
    });
    expect(await findBillingState(dbs.staff.db, businessA)).toMatchObject({
      hasEverPaid: true,
      paymentUnderReview: false,
    });
  });
});

describe("listPaymentsNeedingAttention", () => {
  it("lists unresolved flagged payments across businesses, oldest first, and filters by business", async () => {
    const replaced = await openCheckout(businessA, "fake_sub_a");
    await cancel(replaced);
    const other = await openCheckout(businessB, "fake_sub_b");
    await recordUnappliedPayment(dbs.staff.db, unapplied(replaced, { now: LATER }));
    await recordUnappliedPayment(
      dbs.staff.db,
      unapplied(other, {
        businessId: businessB,
        providerPaymentId: "fake_pay_b",
        amountCents: 250000,
        currency: "INR",
        reason: "amount_mismatch",
        now: PAID_AT,
      }),
    );

    const all = await listPaymentsNeedingAttention(dbs.staff.db, { limit: 10 });
    expect(all).toEqual([
      expect.objectContaining({
        businessId: businessB,
        businessName: "Chennai Cafe",
        reason: "amount_mismatch",
        raisedAt: PAID_AT,
        amountCents: 250000,
        currency: "INR",
      }),
      expect.objectContaining({
        businessId: businessA,
        businessName: "Riverside Plumbing",
        reason: "checkout_replaced",
        providerPaymentId: "fake_pay_late",
      }),
    ]);
    expect(await listPaymentsNeedingAttention(dbs.staff.db, { businessId: businessA, limit: 10 })).toHaveLength(1);
    expect(await listPaymentsNeedingAttention(dbs.staff.db, { limit: 1 })).toHaveLength(1);
    expect(await listPaymentsNeedingAttention(dbs.staff.db, { businessId: "not-a-uuid", limit: 10 })).toEqual([]);
    await expect(listPaymentsNeedingAttention(dbs.staff.db, { limit: 0 })).rejects.toThrow(/positive whole number/);
  });
});

describe("the payments table's own checks", () => {
  it("refuses a manual payment with no reference or date, and a provider payment with manual details", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    const row = {
      businessId: businessA,
      subscriptionId,
      kind: "initial" as const,
      amountCents: 22500,
      currency: "USD" as const,
      status: "captured" as const,
      paidAt: PAID_AT,
    };

    expect(
      await captureErrorText(
        dbs.staff.db
          .insert(payments)
          .values({ ...row, provider: "manual", providerPaymentId: "m1", recordedByStaffId: STAFF_USER }),
      ),
    ).toMatch(/payments_manual_details_check/);
    expect(
      await captureErrorText(
        dbs.staff.db.insert(payments).values({
          ...row,
          provider: "manual",
          providerPaymentId: "m2",
          manualReference: "REF",
          receivedOn: "2026-09-15",
        }),
      ),
    ).toMatch(/payments_manual_recorded_by_check/);
    expect(
      await captureErrorText(
        dbs.staff.db.insert(payments).values({
          ...row,
          provider: "manual",
          providerPaymentId: "m3",
          recordedByStaffId: STAFF_USER,
          manualReference: " REF",
          receivedOn: "2026-09-15",
        }),
      ),
    ).toMatch(/payments_manual_reference_check/);
    expect(
      await captureErrorText(
        dbs.staff.db
          .insert(payments)
          .values({ ...row, provider: "fake", providerPaymentId: "f1", manualReference: "REF", receivedOn: "2026-09-15" }),
      ),
    ).toMatch(/payments_manual_details_check/);
  });

  it("refuses a half-set or baseless attention flag", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    const { payment } = await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));

    expect(
      await captureErrorText(
        dbs.staff.db.update(payments).set({ attentionReason: "already_paid" }).where(eq(payments.id, payment.id)),
      ),
    ).toMatch(/payments_attention_raised_check/);
    expect(
      await captureErrorText(
        dbs.staff.db
          .update(payments)
          .set({ attentionResolvedAt: LATER, attentionResolvedByStaffId: STAFF_USER })
          .where(eq(payments.id, payment.id)),
      ),
    ).toMatch(/payments_attention_resolved_check/);
  });

  it("does not let a customer write any of it", async () => {
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    const { payment } = await recordUnappliedPayment(dbs.staff.db, unapplied(subscriptionId));
    const refused = await captureErrorText(
      withTenantScope(dbs.app.db, scopeA(), (tx) =>
        tx
          .update(payments)
          .set({ attentionResolvedAt: LATER, attentionResolvedByStaffId: USER_A })
          .where(eq(payments.id, payment.id)),
      ),
    );
    expect(refused).toMatch(/permission denied/);
  });
});

describe("listReceiptsForBusiness", () => {
  it("labels each payment with the term its own plan sold, through row-level security", async () => {
    const plan = await usdPlan();
    const subscriptionId = await openCheckout(businessA, "fake_sub_a");
    await recordPaymentAndActivate(dbs.staff.db, await activation(subscriptionId, "fake_pay_a"));
    // A later plan with a different term must not relabel what was already bought.
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.id, plan.id));
    await dbs.owner.db.insert(plans).values({
      code: "care-usd-quarterly",
      name: "Brandbasket care plan",
      currency: "USD",
      initialAmountCents: 22500,
      taxRateBasisPoints: 0,
      initialTermMonths: 3,
      recurringAmountCents: 7500,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 300,
    });

    const own = await withTenantScope(dbs.app.db, scopeA(), (tx) => listReceiptsForBusiness(tx, businessA, 10));
    expect(own).toEqual([expect.objectContaining({ providerPaymentId: "fake_pay_a", initialTermMonths: 1 })]);
    const other = await withTenantScope(dbs.app.db, scopeA(), (tx) => listReceiptsForBusiness(tx, businessB, 10));
    expect(other).toEqual([]);
  });
});

describe("lockBusinessForBilling", () => {
  it("does not hold up a customer's writes that reference the business", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const holder = dbs.staff.db.transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessA);
      locked();
      await held;
    });
    await lockTaken;

    try {
      // A foreign-key insert takes FOR KEY SHARE on the business; FOR UPDATE would make this wait.
      await dbs.staff.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await tx.insert(users).values({ id: "user-c", name: "Cara", email: "cara@example.com" });
        await tx.insert(businessMembers).values({ businessId: businessA, userId: "user-c", role: "owner" });
      });
      const keyShare = await dbs.staff.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        return tx.execute(sql`select id from businesses where id = ${businessA} for key share`);
      });
      expect(keyShare.rows).toHaveLength(1);
    } finally {
      release();
      await holder;
    }
  });
});
