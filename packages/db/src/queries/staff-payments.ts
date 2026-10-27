import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, payments, type BillingCurrency, type BillingProviderName, type PaymentKind } from "../schema";
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
