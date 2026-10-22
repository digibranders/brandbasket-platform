import { and, count, countDistinct, desc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { affiliates, businesses, referralCodes, subscriptions, type BillingCurrency, type ReferralValueKind } from "../schema";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/**
 * Referral codes are staff-only: `bb_app` holds no grant on the table, so every read here runs on the staff
 * connection, including the ones made on a customer's behalf while they are applying a code. The caller is
 * responsible for having checked that the customer owns the business it is acting on.
 */

/**
 * A discount or a reward as the code states it: a flat amount in the code's own currency's minor units, or a
 * percentage in basis points (1250 is 12.5%). The table keeps each pair as two nullable columns under a kind; this
 * union is the only shape that leaves this module, so no caller can read an amount off a percentage code or forget
 * the null. What a percentage is worth in money is worked out against a plan in packages/billing, never here.
 */
export type ReferralValue =
  | { readonly kind: "amount"; readonly amountCents: number }
  | { readonly kind: "percent"; readonly basisPoints: number };

/** What a code takes off every month. Fixed for the code's life. */
export type ReferralDiscount = ReferralValue;

/** What an affiliate earns for each month a member they brought pays. Editable, kind included. */
export type ReferralReward = ReferralValue;

/** Which of the two kinds of code: a coupon pays nobody, an affiliate code earns for its affiliate. */
export type ReferralCodeKind = "coupon" | "affiliate";

/** Which codes a list shows: every code of one kind, or one affiliate's own codes. */
export type ReferralCodeFilter = ReferralCodeKind | { readonly affiliateId: string };

function filterCondition(filter: ReferralCodeFilter) {
  if (filter === "coupon") return isNull(referralCodes.affiliateId);
  if (filter === "affiliate") return isNotNull(referralCodes.affiliateId);
  return eq(referralCodes.affiliateId, filter.affiliateId);
}

export interface ReferralCode {
  readonly id: string;
  readonly code: string;
  readonly currency: BillingCurrency;
  /** The affiliate this code earns for, or null for a coupon. */
  readonly affiliateId: string | null;
  /** What it takes off every month, or null for an affiliate code that gives no discount. A coupon always has one. */
  readonly discount: ReferralDiscount | null;
  /** How many paid months the discount runs for, or null for no limit. Fixed for the code's life, like the discount. */
  readonly discountMonths: number | null;
  readonly active: boolean;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly createdAt: Date;
}

const REFERRAL_CODE_COLUMNS = {
  id: referralCodes.id,
  code: referralCodes.code,
  currency: referralCodes.currency,
  affiliateId: referralCodes.affiliateId,
  discountKind: referralCodes.discountKind,
  discountAmountCents: referralCodes.discountAmountCents,
  discountPercentBasisPoints: referralCodes.discountPercentBasisPoints,
  discountMonths: referralCodes.discountMonths,
  active: referralCodes.active,
  expiresAt: referralCodes.expiresAt,
  maxRedemptions: referralCodes.maxRedemptions,
  createdAt: referralCodes.createdAt,
} as const;

/** A row as the table stores it, before its two pairs of columns are folded into ReferralValues. */
interface ReferralCodeRow {
  readonly id: string;
  readonly code: string;
  readonly currency: BillingCurrency;
  readonly affiliateId: string | null;
  readonly discountKind: ReferralValueKind | null;
  readonly discountAmountCents: number | null;
  readonly discountPercentBasisPoints: number | null;
  readonly discountMonths: number | null;
  readonly active: boolean;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly createdAt: Date;
}

/**
 * One column pair as a ReferralValue. The table's checks make the missing half impossible, so reaching the throw
 * means the schema and this module have drifted apart, which is worth failing loudly on rather than charging a
 * customer against a guess. Shared with the affiliates module, whose reward is the same pair.
 */
export function referralValueOf(
  what: string,
  codeId: string,
  kind: ReferralValueKind,
  amountCents: number | null,
  basisPoints: number | null,
): ReferralValue {
  if (kind === "amount" && amountCents !== null) return { kind, amountCents };
  if (kind === "percent" && basisPoints !== null) return { kind, basisPoints };
  throw new Error(`Referral code ${codeId} has a ${kind} ${what} with no value stored for it`);
}

function toReferralCode(row: ReferralCodeRow): ReferralCode {
  return {
    id: row.id,
    code: row.code,
    currency: row.currency,
    affiliateId: row.affiliateId,
    discount:
      row.discountKind === null
        ? null
        : referralValueOf("discount", row.id, row.discountKind, row.discountAmountCents, row.discountPercentBasisPoints),
    discountMonths: row.discountMonths,
    active: row.active,
    expiresAt: row.expiresAt,
    maxRedemptions: row.maxRedemptions,
    createdAt: row.createdAt,
  };
}

/**
 * The discount as its three columns. Exactly one of the pair is set for a discount, and neither (with no kind) for an
 * affiliate code that gives none, which is what the table's check demands.
 */
type ReferralCodeInsert = typeof referralCodes.$inferInsert;
type DiscountColumns = Required<
  Pick<ReferralCodeInsert, "discountKind" | "discountAmountCents" | "discountPercentBasisPoints">
>;

function discountColumns(discount: ReferralDiscount | null): DiscountColumns {
  if (discount === null) return { discountKind: null, discountAmountCents: null, discountPercentBasisPoints: null };
  return discount.kind === "amount"
    ? { discountKind: discount.kind, discountAmountCents: discount.amountCents, discountPercentBasisPoints: null }
    : { discountKind: discount.kind, discountAmountCents: null, discountPercentBasisPoints: discount.basisPoints };
}

/**
 * A redemption is a subscription that was activated carrying the code, counted once per business (countDistinct on the
 * business): a reactivation that carries the code onto a new subscription does not use the cap up again. An unpaid
 * checkout is not one: it may be replaced or abandoned, and counting it would let a customer who never pays consume a cap.
 */
function redeemedSubscriptions(codeId: string) {
  return and(eq(subscriptions.referralCodeId, codeId), isNotNull(subscriptions.activatedAt));
}

export interface NewReferralCode {
  /** Already normalised; see normaliseReferralCode in packages/billing. */
  readonly code: string;
  readonly currency: BillingCurrency;
  /** Null makes a coupon. */
  readonly affiliateId: string | null;
  /** Null only for an affiliate code; the table refuses a coupon without a discount. */
  readonly discount: ReferralDiscount | null;
  /** Paid months the discount runs for, 1 to 120; null or absent for no limit. */
  readonly discountMonths?: number | null;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly createdByStaffId: string;
}

export async function createReferralCode(db: Runner, input: NewReferralCode): Promise<ReferralCode> {
  const { discount, ...rest } = input;
  const rows = await db
    .insert(referralCodes)
    .values({ ...rest, ...discountColumns(discount) })
    .returning(REFERRAL_CODE_COLUMNS);
  const created = rows[0];
  if (created === undefined) throw new Error("Referral code insert returned no row");
  return toReferralCode(created);
}

export interface ReferralCodeUpdate {
  readonly id: string;
  readonly active: boolean;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
}

/**
 * Changes everything about a code that may still change: whether, until when and how often it may be used.
 *
 * The discount, the currency and the affiliate are deliberately absent and fixed for the code's life. Members
 * already paying carry a frozen copy of the discount, on a Razorpay plan priced for it, and the code is the record of
 * where that came from. Retire the code and make a new one instead.
 */
export async function updateReferralCode(db: Runner, input: ReferralCodeUpdate): Promise<ReferralCode | null> {
  if (!isUuid(input.id)) return null;
  const rows = await db
    .update(referralCodes)
    .set({
      active: input.active,
      expiresAt: input.expiresAt,
      maxRedemptions: input.maxRedemptions,
    })
    .where(eq(referralCodes.id, input.id))
    .returning(REFERRAL_CODE_COLUMNS);
  const updated = rows[0];
  return updated === undefined ? null : toReferralCode(updated);
}

export async function findReferralCodeById(db: Runner, id: string): Promise<ReferralCode | null> {
  if (!isUuid(id)) return null;
  const rows = await db.select(REFERRAL_CODE_COLUMNS).from(referralCodes).where(eq(referralCodes.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toReferralCode(row);
}

export interface ReferralCodeLookup {
  /** Already normalised; an un-normalised string simply will not match. */
  readonly code: string;
  readonly currency: BillingCurrency;
  readonly now: Date;
}

/**
 * The code a customer may redeem right now: active, not expired, for their currency, not already at its cap, and,
 * for an affiliate code, belonging to an affiliate who is still active.
 * Returns null for every reason a code cannot be used, because the caller shows one message for all of them. A
 * field that distinguished "wrong currency" from "no such code" would be an oracle for which codes exist.
 */
export async function findRedeemableReferralCode(db: Runner, lookup: ReferralCodeLookup): Promise<ReferralCode | null> {
  const notExpired = or(isNull(referralCodes.expiresAt), gt(referralCodes.expiresAt, lookup.now));
  if (notExpired === undefined) throw new Error("Could not build the referral expiry condition");
  const rows = await db
    .select(REFERRAL_CODE_COLUMNS)
    .from(referralCodes)
    .leftJoin(affiliates, eq(affiliates.id, referralCodes.affiliateId))
    .where(
      and(
        eq(referralCodes.code, lookup.code),
        eq(referralCodes.currency, lookup.currency),
        eq(referralCodes.active, true),
        notExpired,
        or(isNull(referralCodes.affiliateId), eq(affiliates.active, true)),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const code = toReferralCode(row);
  if (code.maxRedemptions === null) return code;
  const redeemed = await countReferralRedemptions(db, code.id);
  return redeemed < code.maxRedemptions ? code : null;
}

/** How many businesses have ever paid on this code. */
export async function countReferralRedemptions(db: Runner, codeId: string): Promise<number> {
  if (!isUuid(codeId)) return 0;
  const rows = await db.select({ total: countDistinct(subscriptions.businessId) }).from(subscriptions).where(redeemedSubscriptions(codeId));
  return rows[0]?.total ?? 0;
}

/**
 * How many subscriptions point at this code at all, paid or still an open checkout. This is what decides whether
 * a code can be deleted, and it is deliberately not the same as `countReferralRedemptions`, which counts only the
 * ones that were actually paid: an unpaid checkout buys nobody anything but is still a foreign key holding the
 * row in place.
 */
export async function countReferralSubscriptions(db: Runner, codeId: string): Promise<number> {
  if (!isUuid(codeId)) return 0;
  const rows = await db
    .select({ total: count() })
    .from(subscriptions)
    .where(eq(subscriptions.referralCodeId, codeId));
  return rows[0]?.total ?? 0;
}

export interface ListedReferralCode extends ReferralCode {
  readonly redemptions: number;
}

/** Codes of one kind, or one affiliate's, newest first, with how many businesses have paid on each. */
export async function listReferralCodes(
  db: Runner,
  filter: ReferralCodeFilter,
  limit: number,
): Promise<ListedReferralCode[]> {
  if (typeof filter !== "string" && !isUuid(filter.affiliateId)) return [];
  const redemptions = db
    .select({ codeId: subscriptions.referralCodeId, total: countDistinct(subscriptions.businessId).as("total") })
    .from(subscriptions)
    .where(isNotNull(subscriptions.activatedAt))
    .groupBy(subscriptions.referralCodeId)
    .as("redemptions");

  const rows = await db
    .select({ ...REFERRAL_CODE_COLUMNS, redemptions: redemptions.total })
    .from(referralCodes)
    .leftJoin(redemptions, eq(redemptions.codeId, referralCodes.id))
    .where(filterCondition(filter))
    .orderBy(desc(referralCodes.createdAt), desc(referralCodes.id))
    .limit(limit);
  return rows.map(({ redemptions: redeemed, ...row }) => ({ ...toReferralCode(row), redemptions: redeemed ?? 0 }));
}

export interface ReferralRedemption {
  readonly businessId: string;
  readonly businessName: string;
  readonly subscriptionId: string;
  /** What the code was worth against this subscription, frozen when its checkout opened. */
  readonly discountAmountCents: number;
  readonly activatedAt: Date | null;
}

/** Who has redeemed a code, newest first. */
export async function listReferralRedemptions(
  db: Runner,
  codeId: string,
  limit: number,
): Promise<ReferralRedemption[]> {
  if (!isUuid(codeId)) return [];
  return db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      subscriptionId: subscriptions.id,
      discountAmountCents: subscriptions.discountAmountCents,
      activatedAt: subscriptions.activatedAt,
    })
    .from(subscriptions)
    .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
    .where(redeemedSubscriptions(codeId))
    .orderBy(desc(subscriptions.activatedAt))
    .limit(limit);
}

export type ReferralDeletion =
  /** Gone. `clearedApplications` is how many businesses had applied it without paying; they lose the pending discount. */
  | { readonly kind: "deleted"; readonly clearedApplications: number }
  /** Somebody has a subscription on it, so it is part of their billing record and stays. */
  | { readonly kind: "in-use"; readonly subscriptions: number }
  | { readonly kind: "not-found" };

/**
 * Deletes a code nobody has a subscription on. A code that any subscription points at is kept, whether that
 * subscription was ever paid or is still an open checkout: `subscriptions.referral_code_id` is a foreign key, so
 * the database would refuse the delete anyway, and a redeemed code is the only record of where a customer's
 * frozen discount came from. Such a code is turned off, not removed.
 *
 * A business that merely applied the code without paying is a different case: nothing has been charged, so its
 * pending application is cleared in the same transaction and the code goes. The count comes back so the caller
 * can say how many customers just lost a discount they had not used yet.
 */
export async function deleteReferralCode(db: Runner, codeId: string): Promise<ReferralDeletion> {
  if (!isUuid(codeId)) return { kind: "not-found" };
  return db.transaction(async (tx): Promise<ReferralDeletion> => {
    const inUse = await tx
      .select({ total: count() })
      .from(subscriptions)
      .where(eq(subscriptions.referralCodeId, codeId));
    const subscriptionCount = inUse[0]?.total ?? 0;
    if (subscriptionCount > 0) return { kind: "in-use", subscriptions: subscriptionCount };

    const cleared = await tx
      .update(businesses)
      .set({ referralCodeId: null })
      .where(eq(businesses.referralCodeId, codeId))
      .returning({ id: businesses.id });

    const removed = await tx.delete(referralCodes).where(eq(referralCodes.id, codeId)).returning({ id: referralCodes.id });
    if (removed.length === 0) return { kind: "not-found" };
    return { kind: "deleted", clearedApplications: cleared.length };
  });
}

export interface BusinessReferralCodeChange {
  readonly businessId: string;
  /** Null removes the applied code. */
  readonly referralCodeId: string | null;
}

/**
 * Applies or removes the code a business has chosen but not yet paid on. Once a subscription is activated its own
 * frozen `discountAmountCents` decides the money, so changing this afterwards changes only the attribution.
 */
export async function setBusinessReferralCode(db: Runner, input: BusinessReferralCodeChange): Promise<boolean> {
  if (!isUuid(input.businessId)) return false;
  const rows = await db
    .update(businesses)
    .set({ referralCodeId: input.referralCodeId })
    .where(eq(businesses.id, input.businessId))
    .returning({ id: businesses.id });
  return rows.length > 0;
}

/** The code a business has applied, or null. */
export async function findBusinessReferralCode(db: Runner, businessId: string): Promise<ReferralCode | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db
    .select(REFERRAL_CODE_COLUMNS)
    .from(businesses)
    .innerJoin(referralCodes, eq(referralCodes.id, businesses.referralCodeId))
    .where(eq(businesses.id, businessId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toReferralCode(row);
}
