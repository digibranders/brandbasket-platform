import { and, desc, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import {
  affiliateEarnings,
  businesses,
  payments,
  taxInvoices,
  users,
  type BillingCurrency,
  type BillingProviderName,
  type PaymentAttentionReason,
  type PaymentKind,
  type PaymentStatus,
} from "../schema";
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

/** One payment as the console lists it. */
export interface StaffPaymentRow {
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly kind: PaymentKind;
  /** Integer minor units of `currency`. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly status: PaymentStatus;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  /** Razorpay's payment method ("upi", "card"), or null. */
  readonly method: string | null;
  readonly failureReason: string | null;
  readonly attentionReason: PaymentAttentionReason | null;
  readonly attentionResolvedAt: Date | null;
  /** The staff member who recorded a manual payment, by name. */
  readonly recordedByName: string | null;
  readonly refundedAmountCents: number | null;
  readonly refundReason: string | null;
  /** The payment's tax invoice number, when it has one. */
  readonly invoiceNumber: string | null;
}

const recorder = alias(users, "payment_recorder");

const STAFF_PAYMENT_COLUMNS = {
  id: payments.id,
  businessId: payments.businessId,
  businessName: businesses.name,
  provider: payments.provider,
  providerPaymentId: payments.providerPaymentId,
  kind: payments.kind,
  amountCents: payments.amountCents,
  currency: payments.currency,
  status: payments.status,
  paidAt: payments.paidAt,
  createdAt: payments.createdAt,
  method: payments.method,
  failureReason: payments.failureReason,
  attentionReason: payments.attentionReason,
  attentionResolvedAt: payments.attentionResolvedAt,
  recordedByName: recorder.name,
  refundedAmountCents: payments.refundedAmountCents,
  refundReason: payments.refundReason,
  invoiceNumber: taxInvoices.number,
} as const;

/** When a payment happened: when it was paid, or when a failed one was tried. */
const happenedAt = sql`coalesce(${payments.paidAt}, ${payments.createdAt})`;

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error(`limit must be a positive whole number, received ${limit}`);
}

/** Every payment that happened in `[from, to)`, across every client, newest first. */
export async function listPaymentsForStaff(
  db: Database,
  range: { readonly from: Date; readonly to: Date; readonly limit: number },
): Promise<StaffPaymentRow[]> {
  assertLimit(range.limit);
  return db
    .select(STAFF_PAYMENT_COLUMNS)
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .leftJoin(recorder, eq(recorder.id, payments.recordedByStaffId))
    .leftJoin(taxInvoices, eq(taxInvoices.paymentId, payments.id))
    .where(and(sql`${happenedAt} >= ${range.from}`, sql`${happenedAt} < ${range.to}`))
    .orderBy(desc(happenedAt), desc(payments.id))
    .limit(range.limit);
}

/** One client's payments, newest first. */
export async function listPaymentsForClient(db: Database, businessId: string, limit: number): Promise<StaffPaymentRow[]> {
  assertLimit(limit);
  if (!isUuid(businessId)) return [];
  return db
    .select(STAFF_PAYMENT_COLUMNS)
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .leftJoin(recorder, eq(recorder.id, payments.recordedByStaffId))
    .leftJoin(taxInvoices, eq(taxInvoices.paymentId, payments.id))
    .where(eq(payments.businessId, businessId))
    .orderBy(desc(happenedAt), desc(payments.id))
    .limit(limit);
}

/** Payments still flagged for staff, from any month, plus payments that failed since `failedSince`. The rail's count. */
export async function countPaymentsNeedingStaff(db: Database, failedSince: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(payments)
    .where(
      or(
        and(isNotNull(payments.attentionReason), isNull(payments.attentionResolvedAt)),
        and(eq(payments.status, "failed"), gte(payments.createdAt, failedSince)),
      ),
    );
  return rows[0]?.count ?? 0;
}


