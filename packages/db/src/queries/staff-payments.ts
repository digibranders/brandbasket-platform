import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { affiliateEarnings, businesses, payments, type BillingCurrency, type BillingProviderName, type PaymentKind } from "../schema";
import { assertMinorUnits } from "./billing";
import { isUuid } from "./tenant";

/*
 * Payments as staff see them: every payment across every client, failed and refunded ones included. Staff connection
 * only: these read and write across tenants.
 */

const MAX_FAILURE_REASON = 300;

export interface FailedPaymentRecord {
  readonly businessId: string;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly kind: PaymentKind;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** What the provider said went wrong. Stored shortened to 300 characters. */
  readonly failureReason: string;
  readonly failedAt: Date;
}

export type FailedPaymentOutcome = "recorded" | "already-recorded" | "unknown-business";

/**
 * Records a payment attempt that took nothing (Razorpay's payment.failed): a payments row with status failed and no
 * paid time. Staff see it in the console; the customer's receipts leave it out (listReceiptsForBusiness). A retried
 * delivery writes nothing twice, because the provider payment id is unique.
 */
export async function recordFailedPayment(db: Database, input: FailedPaymentRecord): Promise<FailedPaymentOutcome> {
  assertMinorUnits(input.amountCents);
  if (!isUuid(input.businessId)) return "unknown-business";
  const known = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (known.length === 0) return "unknown-business";
  const rows = await db
    .insert(payments)
    .values({
      businessId: input.businessId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      kind: input.kind,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "failed",
      paidAt: null,
      failureReason: input.failureReason.slice(0, MAX_FAILURE_REASON),
      createdAt: input.failedAt,
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning({ id: payments.id });
  return rows.length === 0 ? "already-recorded" : "recorded";
}

export interface PaymentRefundMark {
  readonly paymentId: string;
  readonly businessId: string;
  /** What was given back, in minor units: 1 up to the whole payment. */
  readonly refundedAmountCents: number;
  readonly reason: string;
  readonly staffUserId: string;
  readonly now: Date;
}

export type PaymentRefundOutcome =
  /** `paidEarnings`: affiliate earnings for this payment already paid out, which nobody can take back here. */
  | { readonly kind: "marked"; readonly cancelledEarnings: number; readonly paidEarnings: number }
  | { readonly kind: "not-refundable" }
  | { readonly kind: "amount-too-high" };

/**
 * Marks a paid payment refunded after staff gave the money back outside the console. Cancels any affiliate earning still
 * owed for it, which is how queries/affiliates.ts tells a refunded payment apart. Locks the row, so two staff marking
 * the same payment at once mark it once.
 */
export async function markPaymentRefunded(db: Database, input: PaymentRefundMark): Promise<PaymentRefundOutcome> {
  if (!isUuid(input.paymentId) || !isUuid(input.businessId)) return { kind: "not-refundable" };
  return db.transaction(async (tx): Promise<PaymentRefundOutcome> => {
    const rows = await tx
      .select({ amountCents: payments.amountCents, status: payments.status })
      .from(payments)
      .where(and(eq(payments.id, input.paymentId), eq(payments.businessId, input.businessId)))
      .limit(1)
      .for("update");
    const payment = rows[0];
    if (payment === undefined || payment.status !== "captured") return { kind: "not-refundable" };
    if (!Number.isInteger(input.refundedAmountCents) || input.refundedAmountCents < 1 || input.refundedAmountCents > payment.amountCents) {
      return { kind: "amount-too-high" };
    }
    await tx
      .update(payments)
      .set({
        status: "refunded",
        refundedAt: input.now,
        refundedByStaffId: input.staffUserId,
        refundedAmountCents: input.refundedAmountCents,
        refundReason: input.reason,
      })
      .where(eq(payments.id, input.paymentId));
    const cancelled = await tx
      .update(affiliateEarnings)
      .set({ status: "cancelled", cancelledAt: input.now, cancelledByStaffId: input.staffUserId })
      .where(and(eq(affiliateEarnings.paymentId, input.paymentId), eq(affiliateEarnings.status, "owed")))
      .returning({ id: affiliateEarnings.id });
    const paid = await tx
      .select({ id: affiliateEarnings.id })
      .from(affiliateEarnings)
      .where(and(eq(affiliateEarnings.paymentId, input.paymentId), eq(affiliateEarnings.status, "paid")));
    return { kind: "marked", cancelledEarnings: cancelled.length, paidEarnings: paid.length };
  });
}

