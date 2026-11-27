import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
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

export type PaymentLinkState = "paid" | "revoked" | "balance_due" | "building" | "expired" | "open";

/**
 * Where a link stands, first match wins: paid, cancelled, ready (the balance is due), advance paid (the site is being built), then
 * expired, else open. Expiry stops applying once the advance is paid.
 */
export function paymentLinkState(
  link: Pick<PaymentLink, "paidAt" | "revokedAt" | "readyAt" | "advancePaidAt" | "expiresAt">,
  now: Date,
): PaymentLinkState {
  if (link.paidAt !== null) return "paid";
  if (link.revokedAt !== null) return "revoked";
  if (link.readyAt !== null) return "balance_due";
  if (link.advancePaidAt !== null) return "building";
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
 * The newest link bound to this business that can still be paid: not paid, not cancelled, and either the advance is paid or it is not expired. Read by the checkout under
 * the billing lock, so a link cancelled or paid a moment ago is never honoured.
 */
export async function findOpenPaymentLinkForBusiness(db: Runner, businessId: string, now: Date): Promise<PaymentLink | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, businessId), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt), or(isNotNull(paymentLinks.advancePaidAt), gt(paymentLinks.expiresAt, now))))
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

/** A deal still being worked: advance paid, not cancelled, not paid in full. */
const building = (): ReturnType<typeof and> =>
  and(isNotNull(paymentLinks.advancePaidAt), isNull(paymentLinks.readyAt), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt));

/**
 * Records the charge that collects the advance, once per link. Returns the link's charge id after the call: the one just set, or the one
 * already there, so a retry of payment 1 reuses it. Null when the link does not exist or is paid or cancelled.
 */
export async function attachAdvanceCharge(db: Runner, input: { readonly linkId: string; readonly chargeId: string }): Promise<string | null> {
  if (!isUuid(input.linkId) || !isUuid(input.chargeId)) return null;
  await db
    .update(paymentLinks)
    .set({ advanceChargeId: input.chargeId })
    .where(and(eq(paymentLinks.id, input.linkId), isNull(paymentLinks.advanceChargeId), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)));
  const link = await findPaymentLinkById(db, input.linkId);
  return link?.advanceChargeId ?? null;
}

/** The link whose advance this charge collects, or null (the charge is not an advance, or the id is not a charge). Staff connection only. */
export async function findPaymentLinkByAdvanceChargeId(db: Runner, chargeId: string): Promise<PaymentLink | null> {
  if (!isUuid(chargeId)) return null;
  const rows = await db.select().from(paymentLinks).where(eq(paymentLinks.advanceChargeId, chargeId)).limit(1);
  return rows[0] ?? null;
}

/** Where a business's deal stands once the advance is paid and the plans are not: building the site, or its balance due. */
export interface DealStanding {
  readonly dealLinkId: string;
  readonly dealState: "building" | "balance_due";
}

/**
 * The business's deal that is building or has its balance due, or null. Reads only the columns bb_app may select (migration 0238), so it
 * works on the customer's tenant connection as well as on staff: findBillingState calls it, and every page guard runs that.
 * Same condition as findDealForBusiness.
 */
export async function findDealStanding(db: Runner, businessId: string): Promise<DealStanding | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select({ id: paymentLinks.id, readyAt: paymentLinks.readyAt })
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, businessId), isNotNull(paymentLinks.advancePaidAt), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { dealLinkId: row.id, dealState: row.readyAt === null ? "building" : "balance_due" };
}

/** Records the advance as paid, from the one function every payment path calls. Safe to repeat: the first time stands. */
export async function markAdvancePaid(db: Runner, input: { readonly linkId: string; readonly paidAt: Date }): Promise<void> {
  if (!isUuid(input.linkId)) return;
  await db
    .update(paymentLinks)
    .set({ advancePaidAt: input.paidAt })
    .where(and(eq(paymentLinks.id, input.linkId), isNull(paymentLinks.advancePaidAt)));
}

/** Staff pressed "Website ready": only a deal that is building. False otherwise. */
export async function markLinkReady(db: Runner, input: { readonly linkId: string; readonly staffUserId: string; readonly now: Date }): Promise<boolean> {
  if (!isUuid(input.linkId)) return false;
  const rows = await db
    .update(paymentLinks)
    .set({ readyAt: input.now, readyByStaffId: input.staffUserId })
    .where(and(eq(paymentLinks.id, input.linkId), building()))
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/** Staff undo of "Website ready", only while the balance is still due. */
export async function unmarkLinkReady(db: Runner, input: { readonly linkId: string }): Promise<boolean> {
  if (!isUuid(input.linkId)) return false;
  const rows = await db
    .update(paymentLinks)
    .set({ readyAt: null, readyByStaffId: null })
    .where(and(eq(paymentLinks.id, input.linkId), isNotNull(paymentLinks.readyAt), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/** What staff may change on a deal after the advance: never the advance itself or any column that records a payment. */
export type DealPatch = Partial<
  Pick<
    NewPaymentLink,
    | "services"
    | "billingInterval"
    | "websiteKind"
    | "setupFeeListCents"
    | "setupFeeDiscountCents"
    | "setupFeeNote"
    | "referralCodeId"
    | "websitePriceCents"
    | "socialPriceCents"
    | "adsPriceCents"
    | "monitoringPriceCents"
  >
>;

/**
 * Edits a deal, only while it is building (advance paid, not ready, not paid, not cancelled). False otherwise. The table's checks still
 * judge the result, so a fee that leaves less than the advance is refused by the database.
 */
export async function updateDeal(db: Runner, input: { readonly linkId: string; readonly patch: DealPatch }): Promise<boolean> {
  if (!isUuid(input.linkId)) return false;
  const { services, billingInterval, websiteKind, setupFeeListCents, setupFeeDiscountCents, setupFeeNote, referralCodeId, websitePriceCents, socialPriceCents, adsPriceCents, monitoringPriceCents } = input.patch;
  // Copy only the allowed keys, so a caller that casts a wider object in cannot reach the advance columns.
  const set: DealPatch = {
    services, billingInterval, websiteKind, setupFeeListCents, setupFeeDiscountCents, setupFeeNote, referralCodeId, websitePriceCents, socialPriceCents, adsPriceCents, monitoringPriceCents,
  };
  const defined = Object.fromEntries(Object.entries(set).filter(([, value]) => value !== undefined)) as DealPatch;
  if (Object.keys(defined).length === 0) return false;
  const rows = await db
    .update(paymentLinks)
    .set(defined)
    .where(and(eq(paymentLinks.id, input.linkId), building()))
    .returning({ id: paymentLinks.id });
  return rows.length === 1;
}

/** The link that is building or has its balance due for this business, or null. At most one is allowed to exist (a new link is refused meanwhile). */
export async function findDealForBusiness(db: Runner, businessId: string): Promise<PaymentLink | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, businessId), isNotNull(paymentLinks.advancePaidAt), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** The business's paid deal whose balance has been paid (the newest), or null. For the console's Website tab. Staff connection only. */
export async function findPaidDealForBusiness(db: Runner, businessId: string): Promise<PaymentLink | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.businessId, businessId), eq(paymentLinks.dealType, "paid"), isNotNull(paymentLinks.paidAt)))
    .orderBy(desc(paymentLinks.paidAt))
    .limit(1);
  return rows[0] ?? null;
}

/** A deal whose website is ready and whose balance is unpaid: what the three-day reminder needs. Staff connection only. */
export interface DealAwaitingBalance {
  readonly linkId: string;
  readonly businessId: string;
  readonly readyAt: Date;
  readonly currency: PaymentLink["currency"];
  /** What is left of the build: net price less the advance. */
  readonly balanceCents: number;
}

/** Paid deals marked ready, not paid and not cancelled, bound to a business. Oldest first, at most `limit`. */
export async function listDealsAwaitingBalance(db: Runner, limit: number): Promise<readonly DealAwaitingBalance[]> {
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(and(isNotNull(paymentLinks.businessId), isNotNull(paymentLinks.readyAt), isNull(paymentLinks.paidAt), isNull(paymentLinks.revokedAt)))
    .orderBy(paymentLinks.readyAt)
    .limit(limit);
  return rows.flatMap((link) =>
    link.businessId === null || link.readyAt === null || link.setupFeeListCents === null || link.advanceCents === null
      ? []
      : [{ linkId: link.id, businessId: link.businessId, readyAt: link.readyAt, currency: link.currency, balanceCents: link.setupFeeListCents - (link.setupFeeDiscountCents ?? 0) - link.advanceCents }],
  );
}
