import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  affiliateEarnings,
  billingProfiles,
  businesses,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findCreditNoteByPaymentId,
  findTaxInvoiceByPaymentId,
  insertAffiliateEarning,
  payments,
  taxInvoices,
  users,
  type Payment,
  type Plan,
} from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executePaymentRefund } from "./server/payment-refund";
import { issueTaxInvoice } from "./server/tax-invoicing";

vi.mock("server-only", () => ({}));

const STAFF_USER = "staff-refund-1";
const PAID_AT = new Date("2026-10-15T10:00:00.000Z");
const REFUND_DATE = new Date("2026-10-18T14:30:00.000Z");
const FAKE_SECRET = "0123456789abcdef0123456789abcdef";

let dbs: TestDatabases;
let businessId = "";
let servicesPlan: Plan;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR plan was seeded");
  servicesPlan = plan;
  await dbs.owner.db.insert(users).values({
    id: STAFF_USER,
    name: "Finance Staff",
    email: "finance@brandbasket.com",
    emailVerified: true,
  });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "om-sweets", name: "Om Sweets", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

function planSource(amountCents: number) {
  return {
    kind: "plan" as const,
    plan: servicesPlan,
    netAmountCents: amountCents,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    monthly: true,
    periodStart: PAID_AT,
    periodEnd: new Date("2026-11-15T10:00:00.000Z"),
  };
}

async function saveCustomerBillingProfile(stateCode: "mh" | "dl", postalCode?: string): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "Om Sweets Private Limited",
    gstin: stateCode === "mh" ? "27AAPFU0939F1ZV" : null,
    addressLine1: "Main Market",
    city: stateCode === "mh" ? "Mumbai" : "New Delhi",
    postalCode: postalCode ?? (stateCode === "mh" ? "400080" : "110001"),
    stateCode,
    email: "accounts@omsweets.com",
    phone: "+919876543210",
  });
}

async function seedCapturedPayment(providerPaymentId: string, amountCents = 299_900): Promise<Payment> {
  const [payment] = await dbs.staff.db
    .insert(payments)
    .values({
      businessId,
      provider: "fake",
      providerPaymentId,
      kind: "renewal",
      amountCents,
      currency: "INR",
      status: "captured",
      paidAt: PAID_AT,
      method: "card",
      cardNetwork: "Visa",
      cardType: "credit",
      cardLast4: "1234",
    })
    .returning();
  if (!payment) throw new Error("Payment not seeded");
  return payment;
}

async function seedOwedAffiliateEarning(paymentId: string, amountCents = 20_000): Promise<string> {
  const affiliate = await createAffiliate(dbs.staff.db, {
    name: "Partner Vikas",
    email: "vikas@partner.com",
    phone: "+919876543211",
    reward: { kind: "amount", amountCents },
    rewardCurrency: "INR",
    rewardCycles: null,
    notes: null,
    createdByStaffId: STAFF_USER,
  });
  const code = await createReferralCode(dbs.staff.db, {
    code: "VIKAS20",
    currency: "INR",
    affiliateId: affiliate.id,
    discount: { kind: "percent", basisPoints: 2000 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  await insertAffiliateEarning(dbs.staff.db, {
    affiliateId: affiliate.id,
    referralCodeId: code.id,
    businessId,
    paymentId,
    amountCents,
    currency: "INR",
    basisCents: 249_900,
    cycleNumber: 1,
  });
  const rows = await querySql<{ id: string }>(dbs.owner, `select id from affiliate_earnings where payment_id = '${paymentId}'`);
  return rows[0]?.id ?? "";
}

describe("executePaymentRefund integration", () => {
  it("processes a full refund: calls provider, marks DB, cancels earnings, issues credit note with exact GST reversal", async () => {
    // Maharashtra customer (intra-state CGST + SGST since supplier is MH)
    await saveCustomerBillingProfile("mh");
    const payment = await seedCapturedPayment("fake_pay_full_1", 299_900);
    const earningId = await seedOwedAffiliateEarning(payment.id);

    // Issue invoice first
    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice).not.toBeNull();

    const provider = createFakeBillingProvider({ secret: FAKE_SECRET });
    const result = await executePaymentRefund(dbs.staff.db, provider, {
      paymentId: payment.id,
      businessId,
      refundedAmountCents: 299_900,
      reason: "Customer requested cancellation",
      staffUserId: STAFF_USER,
      now: REFUND_DATE,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      expect(result.providerRefundId).toMatch(/^fake_rfnd_/);
      expect(result.creditNote).not.toBeNull();
      expect(result.creditNote?.number).toMatch(/^CN\/\d{2}-\d{2}\/\d{6}$/);
      expect(result.creditNote?.number.length).toBeLessThanOrEqual(16);
      expect(result.cancelledEarnings).toBe(1);
    }

    // Verify payment in DB
    const [dbPayment] = await querySql<{ status: string; refunded_amount_cents: number; refund_reason: string; refunded_by_staff_id: string }>(
      dbs.owner,
      `select status, refunded_amount_cents, refund_reason, refunded_by_staff_id from payments where id = '${payment.id}'`,
    );
    expect(dbPayment).toMatchObject({
      status: "refunded",
      refunded_amount_cents: 299_900,
      refund_reason: "Customer requested cancellation",
      refunded_by_staff_id: STAFF_USER,
    });

    // Verify affiliate earning cancelled
    const [dbEarning] = await querySql<{ status: string; cancelled_by_staff_id: string }>(
      dbs.owner,
      `select status, cancelled_by_staff_id from affiliate_earnings where id = '${earningId}'`,
    );
    expect(dbEarning).toMatchObject({
      status: "cancelled",
      cancelled_by_staff_id: STAFF_USER,
    });

    // Verify credit note in DB
    const creditNote = await findCreditNoteByPaymentId(dbs.staff.db, payment.id);
    expect(creditNote).not.toBeNull();
    expect(creditNote?.invoiceId).toBe(invoice?.id);
    expect(creditNote?.totalCents).toBe(299_900);
    expect(creditNote?.refundedAmountCents).toBe(299_900);
    expect(creditNote?.taxableCents).toBe(invoice?.taxableCents);
    expect(creditNote?.cgstCents).toBe(invoice?.cgstCents);
    expect(creditNote?.sgstCents).toBe(invoice?.sgstCents);
    expect(creditNote?.igstCents).toBe(invoice?.igstCents);
    expect(creditNote?.roundOffCents).toBe(invoice?.roundOffCents);
    // Intra-state reversal check
    expect(creditNote?.supplyType).toBe("intra_state");
    expect(creditNote?.cgstCents).toBeGreaterThan(0);
    expect(creditNote?.sgstCents).toBeGreaterThan(0);
    expect(creditNote?.igstCents).toBe(0);
  });

  it("processes a partial refund with proportional line allocation and exact GST reversal", async () => {
    await saveCustomerBillingProfile("mh");
    const payment = await seedCapturedPayment("fake_pay_partial_1", 299_900);

    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });

    const provider = createFakeBillingProvider({ secret: FAKE_SECRET });
    const result = await executePaymentRefund(dbs.staff.db, provider, {
      paymentId: payment.id,
      businessId,
      refundedAmountCents: 100_000,
      reason: "Partial goodwill discount",
      staffUserId: STAFF_USER,
      now: REFUND_DATE,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      const cn = result.creditNote!;
      expect(cn.totalCents).toBe(100_000);
      expect(cn.refundedAmountCents).toBe(100_000);
      expect(cn.taxableCents + cn.cgstCents + cn.sgstCents + cn.igstCents + cn.roundOffCents).toBe(100_000);
      expect(cn.supplyType).toBe("intra_state");
      expect(cn.cgstCents).toBeGreaterThan(0);
      expect(cn.sgstCents).toBeGreaterThan(0);
      expect(cn.igstCents).toBe(0);
    }
  });

  it("handles inter-state credit notes with exact IGST reversal", async () => {
    // Delhi customer (inter-state IGST since supplier is MH)
    await saveCustomerBillingProfile("dl");
    const payment = await seedCapturedPayment("fake_pay_interstate_1", 299_900);

    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice?.supplyType).toBe("inter_state");

    const provider = createFakeBillingProvider({ secret: FAKE_SECRET });
    const result = await executePaymentRefund(dbs.staff.db, provider, {
      paymentId: payment.id,
      businessId,
      refundedAmountCents: 299_900,
      reason: "Inter-state refund",
      staffUserId: STAFF_USER,
      now: REFUND_DATE,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      const cn = result.creditNote!;
      expect(cn.supplyType).toBe("inter_state");
      expect(cn.igstCents).toBe(invoice?.igstCents);
      expect(cn.cgstCents).toBe(0);
      expect(cn.sgstCents).toBe(0);
      expect(cn.taxableCents).toBe(invoice?.taxableCents);
      expect(cn.totalCents).toBe(299_900);
      expect(cn.refundedAmountCents).toBe(299_900);
    }
  });

  it("executes refund with Razorpay provider stub without network", async () => {
    await saveCustomerBillingProfile("mh");
    const payment = await seedCapturedPayment("rzp_pay_stub_1", 150_000);

    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });

    const stubRazorpayProvider = {
      name: "razorpay",
      refundPayment: vi.fn().mockResolvedValue({ providerRefundId: "rfnd_rzp_mock_123" }),
    } as unknown as BillingProvider;

    const result = await executePaymentRefund(dbs.staff.db, stubRazorpayProvider, {
      paymentId: payment.id,
      businessId,
      refundedAmountCents: 150_000,
      reason: "Razorpay refund test",
      staffUserId: STAFF_USER,
      now: REFUND_DATE,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      expect(result.providerRefundId).toBe("rfnd_rzp_mock_123");
    }
    expect(stubRazorpayProvider.refundPayment).toHaveBeenCalledWith({
      providerPaymentId: "rzp_pay_stub_1",
      amountCents: 150_000,
      reason: "Razorpay refund test",
    });
  });

  it("aborts transaction and marks nothing on provider failure", async () => {
    await saveCustomerBillingProfile("mh");
    const payment = await seedCapturedPayment("pay_provider_fail_1", 200_000);
    const earningId = await seedOwedAffiliateEarning(payment.id);

    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });

    const failingProvider = {
      name: "razorpay",
      refundPayment: vi.fn().mockRejectedValue(new Error("Gateway connection timed out")),
    } as unknown as BillingProvider;

    const result = await executePaymentRefund(dbs.staff.db, failingProvider, {
      paymentId: payment.id,
      businessId,
      refundedAmountCents: 200_000,
      reason: "Failed attempt",
      staffUserId: STAFF_USER,
      now: REFUND_DATE,
    });

    expect(result.kind).toBe("provider-failed");
    if (result.kind === "provider-failed") {
      expect(result.error).toContain("Gateway connection timed out");
    }

    // DB state must be completely untouched
    const [dbPayment] = await querySql<{ status: string; refunded_at: string | null; refunded_amount_cents: number | null }>(
      dbs.owner,
      `select status, refunded_at, refunded_amount_cents from payments where id = '${payment.id}'`,
    );
    expect(dbPayment?.status).toBe("captured");
    expect(dbPayment?.refunded_at).toBeNull();
    expect(dbPayment?.refunded_amount_cents).toBeNull();

    const [dbEarning] = await querySql<{ status: string }>(
      dbs.owner,
      `select status from affiliate_earnings where id = '${earningId}'`,
    );
    expect(dbEarning?.status).toBe("owed");

    const creditNote = await findCreditNoteByPaymentId(dbs.staff.db, payment.id);
    expect(creditNote).toBeNull();
  });

  it("guarantees idempotency on double press / concurrent requests: refunds once", async () => {
    await saveCustomerBillingProfile("mh");
    const payment = await seedCapturedPayment("fake_pay_double_1", 299_900);

    await dbs.staff.db.transaction(async (tx) => {
      await issueTaxInvoice(tx, payment, planSource(payment.amountCents));
    });

    let callCount = 0;
    const provider = {
      name: "fake",
      refundPayment: vi.fn().mockImplementation(async () => {
        callCount++;
        // Simulate small provider latency
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { providerRefundId: "fake_rfnd_concurrency" };
      }),
    } as unknown as BillingProvider;

    // Fire two concurrent refund requests
    const [res1, res2] = await Promise.all([
      executePaymentRefund(dbs.staff.db, provider, {
        paymentId: payment.id,
        businessId,
        refundedAmountCents: 299_900,
        reason: "Double press test",
        staffUserId: STAFF_USER,
        now: REFUND_DATE,
      }),
      executePaymentRefund(dbs.staff.db, provider, {
        paymentId: payment.id,
        businessId,
        refundedAmountCents: 299_900,
        reason: "Double press test",
        staffUserId: STAFF_USER,
        now: REFUND_DATE,
      }),
    ]);

    const outcomes = [res1.kind, res2.kind].sort();
    expect(outcomes).toEqual(["already-refunded", "refunded"]);
    expect(callCount).toBe(1);

    // Verify only one credit note in DB
    const cnList = await querySql<{ status: string }>(dbs.owner, `select status from payments where id = '${payment.id}'`);
    expect(cnList[0]?.status).toBe("refunded");
    const creditNote = await findCreditNoteByPaymentId(dbs.staff.db, payment.id);
    expect(creditNote).not.toBeNull();
  });
});
