import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAffiliate, insertAffiliateEarning } from "./queries/affiliates";
import { createReferralCode } from "./queries/referrals";
import { markPaymentRefunded, recordFailedPayment } from "./queries/staff-payments";
import { affiliateEarnings, businesses, payments, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user";
const NOV_11 = new Date("2026-11-11T06:30:00.000Z");
const NO_SUCH_BUSINESS = "01920000-0000-7000-8000-000000000999";
const NOV_10 = new Date("2026-11-10T06:30:00.000Z");
const NOV_12 = new Date("2026-11-12T06:30:00.000Z");

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Riya Kapoor", email: "riya@example.com", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "om-sweets", name: "Om Sweets", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

const failure = {
  provider: "razorpay",
  providerPaymentId: "pay_failed_1",
  kind: "renewal",
  amountCents: 299_900,
  currency: "INR",
  failureReason: "Card declined by the bank",
  failedAt: NOV_11,
} as const;

describe("recordFailedPayment", () => {
  it("records a failed attempt once, with no paid time", async () => {
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId })).toBe("recorded");
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId })).toBe("already-recorded");

    const rows = await dbs.staff.db.select().from(payments).where(eq(payments.providerPaymentId, "pay_failed_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId,
      status: "failed",
      paidAt: null,
      failureReason: "Card declined by the bank",
      createdAt: NOV_11,
    });
  });

  it("records nothing for a business that does not exist", async () => {
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId: NO_SUCH_BUSINESS })).toBe("unknown-business");
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId: "not-a-uuid" })).toBe("unknown-business");
    expect(await dbs.staff.db.select().from(payments)).toHaveLength(0);
  });
});

async function insertPayment(values: Partial<typeof payments.$inferInsert> & { providerPaymentId: string }): Promise<string> {
  const rows = await dbs.staff.db
    .insert(payments)
    .values({
      businessId,
      provider: "razorpay",
      kind: "renewal",
      amountCents: 299_900,
      currency: "INR",
      status: "captured",
      paidAt: NOV_10,
      createdAt: NOV_10,
      ...values,
    })
    .returning({ id: payments.id });
  return rows[0]?.id ?? "";
}

async function readPayment(id: string): Promise<typeof payments.$inferSelect | undefined> {
  const rows = await dbs.staff.db.select().from(payments).where(eq(payments.id, id));
  return rows[0];
}

async function seedOwedEarning(paymentId: string): Promise<string> {
  const affiliate = await createAffiliate(dbs.staff.db, {
    name: "Asha Nair",
    email: null,
    phone: "+919876543210",
    reward: { kind: "amount", amountCents: 20_000 },
    rewardCurrency: "INR",
    rewardCycles: null,
    notes: null,
    createdByStaffId: STAFF_USER,
  });
  const code = await createReferralCode(dbs.staff.db, {
    code: "ASHA500",
    currency: "INR",
    affiliateId: affiliate.id,
    discount: { kind: "amount", amountCents: 50_000 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  await insertAffiliateEarning(dbs.staff.db, {
    affiliateId: affiliate.id,
    referralCodeId: code.id,
    businessId,
    paymentId,
    amountCents: 20_000,
    currency: "INR",
    basisCents: 249_900,
    cycleNumber: 1,
  });
  const rows = await dbs.staff.db.select({ id: affiliateEarnings.id }).from(affiliateEarnings).where(eq(affiliateEarnings.paymentId, paymentId));
  return rows[0]?.id ?? "";
}

describe("markPaymentRefunded", () => {
  const mark = (paymentId: string, refundedAmountCents = 100_000, forBusiness = businessId) =>
    markPaymentRefunded(dbs.staff.db, {
      paymentId,
      businessId: forBusiness,
      refundedAmountCents,
      reason: "Charged twice by mistake",
      staffUserId: STAFF_USER,
      now: NOV_12,
    });

  it("marks a paid payment refunded with the amount, the reason, who and when", async () => {
    const paymentId = await insertPayment({ providerPaymentId: "pay_paid_1" });

    expect(await mark(paymentId)).toEqual({ kind: "marked", cancelledEarnings: 0, paidEarnings: 0 });
    expect(await readPayment(paymentId)).toMatchObject({
      status: "refunded",
      refundedAt: NOV_12,
      refundedByStaffId: STAFF_USER,
      refundedAmountCents: 100_000,
      refundReason: "Charged twice by mistake",
    });
  });

  it("refuses a payment that is not paid, an amount above the payment, and another business's payment", async () => {
    const failedId = await insertPayment({ providerPaymentId: "pay_failed_2", status: "failed", paidAt: null });
    const paidId = await insertPayment({ providerPaymentId: "pay_paid_2" });

    expect(await mark(failedId)).toEqual({ kind: "not-refundable" });
    expect(await mark(paidId, 299_901)).toEqual({ kind: "amount-too-high" });
    expect(await mark(paidId, 0)).toEqual({ kind: "amount-too-high" });
    expect(await mark(paidId, 100_000, NO_SUCH_BUSINESS)).toEqual({ kind: "not-refundable" });
    expect(await mark(paidId)).toEqual({ kind: "marked", cancelledEarnings: 0, paidEarnings: 0 });
    expect(await mark(paidId)).toEqual({ kind: "not-refundable" });
  });

  it("cancels the affiliate earning still owed for the payment", async () => {
    const paymentId = await insertPayment({ providerPaymentId: "pay_paid_3" });
    const earningId = await seedOwedEarning(paymentId);

    expect(await mark(paymentId, 299_900)).toEqual({ kind: "marked", cancelledEarnings: 1, paidEarnings: 0 });
    const rows = await dbs.staff.db.select().from(affiliateEarnings).where(eq(affiliateEarnings.id, earningId));
    expect(rows[0]).toMatchObject({ status: "cancelled", cancelledByStaffId: STAFF_USER, cancelledAt: NOV_12 });
  });

  it("refuses refund details on a payment that is not refunded", async () => {
    const error = await captureErrorText(
      insertPayment({
        providerPaymentId: "pay_bad_mark",
        refundedAt: NOV_12,
        refundedByStaffId: STAFF_USER,
        refundedAmountCents: 100,
        refundReason: "Wrong",
      }),
    );
    expect(error).toContain("payments_refund_details_check");
  });
});

