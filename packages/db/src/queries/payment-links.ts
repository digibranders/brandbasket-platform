import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { type NewPaymentLink, type PaymentLink, paymentLinks } from "../schema";
import type { ScopedTransaction } from "../scope";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/**
 * Payment links are staff-only (docs/plans/65): `bb_app` holds no grant on the table, so every read and write here runs on the
 * staff connection, including the ones the customer app makes for a visitor holding a link's token. The caller hashes the token
 * first and never stores it; whoever calls on a customer's behalf has already checked what that customer may do with the link.
 */

export type PaymentLinkState = "open" | "paid" | "revoked" | "expired";

/** Where a link stands: paid wins over cancelled, and cancelled over expired. */
export function paymentLinkState(link: Pick<PaymentLink, "paidAt" | "revokedAt" | "expiresAt">, now: Date): PaymentLinkState {
  if (link.paidAt !== null) return "paid";
  if (link.revokedAt !== null) return "revoked";
  return link.expiresAt.getTime() <= now.getTime() ? "expired" : "open";
}

export async function insertPaymentLink(db: Runner, values: NewPaymentLink): Promise<PaymentLink> {
  const rows = await db.insert(paymentLinks).values(values).returning();
  const link = rows[0];
  if (link === undefined) throw new Error("Payment link insert returned no row");
  return link;
}

export async function findPaymentLinkByTokenHash(db: Runner, tokenHash: string): Promise<PaymentLink | null> {
  const rows = await db.select().from(paymentLinks).where(eq(paymentLinks.tokenHash, tokenHash)).limit(1);
  return rows[0] ?? null;
}

export async function findPaymentLinkById(db: Runner, linkId: string): Promise<PaymentLink | null> {
  if (!isUuid(linkId)) return null;
  const rows = await db.select().from(paymentLinks).where(eq(paymentLinks.id, linkId)).limit(1);
  return rows[0] ?? null;
}

/**
 * The newest link bound to this business that can still be paid: not paid, not cancelled, not expired. Read by the checkout under
 * the billing lock, so a link cancelled or paid a moment ago is never honoured.
 */
export async function findOpenPaymentLinkForBusiness(db: Runner, businessId: string, now: Date): Promise<PaymentLink | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, businessId), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt), gt(paymentLinks.expiresAt, now)))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Binds an open link that names no business yet to the business just made for its customer. False when the link was bound, paid,
 * cancelled or expired meanwhile: one statement decides, so two visitors with the same token cannot both bind it.
 */
export async function bindPaymentLink(db: Runner, input: { readonly linkId: string; readonly businessId: string; readonly now: Date }): Promise<boolean> {
  if (!isUuid(input.linkId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(paymentLinks)
    .set({ businessId: input.businessId, redeemedAt: input.now })
    .where(
      and(
        eq(paymentLinks.id, input.linkId),
        isNull(paymentLinks.businessId),
        isNull(paymentLinks.paidAt),
        isNull(paymentLinks.revokedAt),
        gt(paymentLinks.expiresAt, input.now),
      ),
    )
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/** Cancels a link that is not paid yet. False for a paid or already cancelled one. */
export async function revokePaymentLink(db: Runner, input: { readonly linkId: string; readonly staffUserId: string; readonly now: Date }): Promise<boolean> {
  if (!isUuid(input.linkId)) return false;
  const rows = await db
    .update(paymentLinks)
    .set({ revokedAt: input.now, revokedByStaffId: input.staffUserId })
    .where(and(eq(paymentLinks.id, input.linkId), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/** Moves the expiry of a link that is not paid or cancelled, an expired one included (so extending brings it back). */
export async function extendPaymentLink(db: Runner, input: { readonly linkId: string; readonly expiresAt: Date }): Promise<boolean> {
  if (!isUuid(input.linkId)) return false;
  const rows = await db
    .update(paymentLinks)
    .set({ expiresAt: input.expiresAt })
    .where(and(eq(paymentLinks.id, input.linkId), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/**
 * Marks the link paid by this subscription, in the activation transaction. Safe to repeat for the same subscription (the webhook and
 * the return page can both deliver); a link paid by another subscription is a bug, never a state to hide.
 */
export async function markPaymentLinkPaid(db: Runner, input: { readonly linkId: string; readonly subscriptionId: string; readonly paidAt: Date }): Promise<void> {
  const rows = await db
    .update(paymentLinks)
    .set({ paidAt: input.paidAt, subscriptionId: input.subscriptionId })
    .where(and(eq(paymentLinks.id, input.linkId), isNull(paymentLinks.paidAt)))
    .returning({ id: paymentLinks.id });
  if (rows.length === 1) return;
  const link = await findPaymentLinkById(db, input.linkId);
  if (link === null) throw new Error(`Payment link ${input.linkId} does not exist`);
  if (link.subscriptionId !== input.subscriptionId) {
    throw new Error(`Payment link ${input.linkId} was paid by subscription ${String(link.subscriptionId)}, not ${input.subscriptionId}`);
  }
}

/** Newest first, for the console's list. */
export async function listPaymentLinks(db: Runner, input: { readonly limit: number; readonly offset: number }): Promise<readonly PaymentLink[]> {
  return db.select().from(paymentLinks).orderBy(desc(paymentLinks.createdAt)).limit(input.limit).offset(input.offset);
}
