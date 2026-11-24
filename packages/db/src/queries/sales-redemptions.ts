import { uuidv7 } from "uuidv7";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  businesses,
  businessMembers,
  payments,
  referralCodes,
  salesRedemptionEvents,
  subscriptions,
  users,
  type BillingCurrency,
  type PaymentKind,
} from "../schema";

type Runner = Database | ScopedTransaction;

/**
 * Paid coupon redemptions waiting to be told to Fynix Sales. Staff connection only, like the codes themselves.
 *
 * A row is queued by `queueSalesRedemption` inside the transaction that records a payment, for a payment made on a
 * subscription that carries a plain coupon (not an affiliate's code). Fynix decides whose coupon it is. The sender (`apps/customer`) reads the due rows,
 * posts them and stamps them delivered or failed.
 */

/** Queues one payment for Fynix when its subscription carries a plain coupon; a no-op otherwise or if already queued. */
export async function queueSalesRedemption(db: Runner, paymentId: string): Promise<void> {
  await db.execute(sql`
    insert into ${salesRedemptionEvents} (id, referral_code_id, business_id, payment_id)
    select ${uuidv7()}::uuid, ${referralCodes.id}, ${payments.businessId}, ${payments.id}
    from ${payments}
    join ${subscriptions} on ${subscriptions.id} = ${payments.subscriptionId}
    join ${referralCodes} on ${referralCodes.id} = ${subscriptions.referralCodeId}
    where ${payments.id} = ${paymentId}
      and ${payments.status} = 'captured'
      and ${referralCodes.affiliateId} is null
    on conflict (payment_id) do nothing
  `);
}

/** One paid redemption as Fynix is told about it. */
export interface SalesRedemption {
  /** Stable for the row: Fynix de-duplicates on it. */
  readonly eventId: string;
  readonly couponCode: string;
  readonly businessId: string;
  readonly businessName: string;
  /** The owner's sign-in email, or null if the business has no owner row. */
  readonly clientEmail: string | null;
  readonly paymentId: string;
  readonly paymentKind: PaymentKind;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly attempts: number;
}

/** Undelivered redemptions whose next attempt is due, oldest first. */
export async function listDueSalesRedemptions(db: Runner, now: Date, limit: number): Promise<SalesRedemption[]> {
  const rows = await db
    .select({
      eventId: salesRedemptionEvents.id,
      couponCode: referralCodes.code,
      businessId: businesses.id,
      businessName: businesses.name,
      clientEmail: sql<string | null>`(
        select ${users.email} from ${businessMembers}
        join ${users} on ${users.id} = ${businessMembers.userId}
        where ${businessMembers.businessId} = ${businesses.id} and ${businessMembers.role} = 'owner'
        order by ${businessMembers.createdAt} asc limit 1
      )`,
      paymentId: payments.id,
      paymentKind: payments.kind,
      amountCents: payments.amountCents,
      currency: payments.currency,
      paidAt: payments.paidAt,
      attempts: salesRedemptionEvents.attempts,
    })
    .from(salesRedemptionEvents)
    .innerJoin(referralCodes, eq(referralCodes.id, salesRedemptionEvents.referralCodeId))
    .innerJoin(businesses, eq(businesses.id, salesRedemptionEvents.businessId))
    .innerJoin(payments, eq(payments.id, salesRedemptionEvents.paymentId))
    .where(and(isNull(salesRedemptionEvents.deliveredAt), lte(salesRedemptionEvents.nextAttemptAt, now)))
    .orderBy(asc(salesRedemptionEvents.createdAt))
    .limit(limit);
  return rows.flatMap((row) => (row.paidAt === null ? [] : [{ ...row, paidAt: row.paidAt }]));
}

export async function markSalesRedemptionDelivered(db: Runner, eventId: string, now: Date): Promise<void> {
  await db
    .update(salesRedemptionEvents)
    .set({ deliveredAt: now, lastError: null, attempts: sql`${salesRedemptionEvents.attempts} + 1` })
    .where(eq(salesRedemptionEvents.id, eventId));
}

/** Backs off 1, 2, 4 ... minutes up to six hours between attempts. */
export function salesRedemptionBackoffMs(attempts: number): number {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempts));
}

export async function markSalesRedemptionFailed(db: Runner, eventId: string, error: string, attempts: number, now: Date): Promise<void> {
  await db
    .update(salesRedemptionEvents)
    .set({
      attempts: attempts + 1,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + salesRedemptionBackoffMs(attempts)),
    })
    .where(eq(salesRedemptionEvents.id, eventId));
}
