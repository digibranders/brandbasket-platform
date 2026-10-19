import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql, sum } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  accounts,
  sessions,
  affiliateEarnings,
  affiliatePayouts,
  affiliates,
  businesses,
  payments,
  plans,
  referralCodes,
  subscriptions,
  type AffiliateEarningStatus,
  type BillingCurrency,
  type PaymentKind,
  type SubscriptionStatus,
} from "../schema";
import { hashInviteToken } from "./invites";
import { referralValueOf, type ReferralReward } from "./referrals";
import { hasPostgresCode, isUuid, UNIQUE_VIOLATION } from "./tenant";

type Runner = Database | ScopedTransaction;

/**
 * Affiliates, what they earn and what they have been paid. Staff-only: `bb_app` holds no grant on any of these
 * tables. Earnings are written by the payment path (accrueAffiliateEarning in packages/shared), in the payment's own
 * transaction; everything else here is the staff console's, and the affiliate's own dashboard, which reads them on the
 * staff connection for the one affiliate the signed-in user is linked to (findAffiliateByUserId).
 */

export interface Affiliate {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  /** E.164, "+919876543210". */
  readonly phone: string | null;
  /** What they earn for each month a member they brought pays. */
  readonly reward: ReferralReward;
  /** The currency a flat reward is paid in; null for a percentage, which takes each payment's own currency. */
  readonly rewardCurrency: BillingCurrency | null;
  /** How many of each member's paid months earn the reward; null for every month the member pays. */
  readonly rewardCycles: number | null;
  readonly active: boolean;
  readonly notes: string | null;
  readonly createdAt: Date;
}

const AFFILIATE_COLUMNS = {
  id: affiliates.id,
  name: affiliates.name,
  email: affiliates.email,
  phone: affiliates.phone,
  rewardKind: affiliates.rewardKind,
  rewardAmountCents: affiliates.rewardAmountCents,
  rewardCurrency: affiliates.rewardCurrency,
  rewardPercentBasisPoints: affiliates.rewardPercentBasisPoints,
  rewardCycles: affiliates.rewardCycles,
  active: affiliates.active,
  notes: affiliates.notes,
  createdAt: affiliates.createdAt,
} as const;

type AffiliateRow = {
  readonly [K in keyof typeof AFFILIATE_COLUMNS]: (typeof AFFILIATE_COLUMNS)[K]["_"]["notNull"] extends true
    ? (typeof AFFILIATE_COLUMNS)[K]["_"]["data"]
    : (typeof AFFILIATE_COLUMNS)[K]["_"]["data"] | null;
};

function toAffiliate(row: AffiliateRow): Affiliate {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    reward: referralValueOf("reward", row.id, row.rewardKind, row.rewardAmountCents, row.rewardPercentBasisPoints),
    rewardCurrency: row.rewardCurrency,
    rewardCycles: row.rewardCycles,
    active: row.active,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

type AffiliateInsert = typeof affiliates.$inferInsert;
type RewardColumns = Required<
  Pick<AffiliateInsert, "rewardKind" | "rewardAmountCents" | "rewardCurrency" | "rewardPercentBasisPoints">
>;

/** The reward as its four columns, exactly as the table's check demands for each kind. */
function rewardColumns(reward: ReferralReward, currency: BillingCurrency | null): RewardColumns {
  if (reward.kind === "percent") {
    return { rewardKind: "percent", rewardAmountCents: null, rewardCurrency: null, rewardPercentBasisPoints: reward.basisPoints };
  }
  if (currency === null) throw new RangeError("A flat affiliate reward needs the currency it is paid in");
  return { rewardKind: "amount", rewardAmountCents: reward.amountCents, rewardCurrency: currency, rewardPercentBasisPoints: null };
}

export interface AffiliateDetails {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly reward: ReferralReward;
  /** Required for a flat reward, ignored for a percentage. */
  readonly rewardCurrency: BillingCurrency | null;
  /** Null for every paid month; otherwise 1 to 120. */
  readonly rewardCycles: number | null;
  readonly notes: string | null;
}

export interface NewAffiliate extends AffiliateDetails {
  readonly createdByStaffId: string;
}

export async function createAffiliate(db: Runner, input: NewAffiliate): Promise<Affiliate> {
  const { reward, rewardCurrency, ...rest } = input;
  const rows = await db
    .insert(affiliates)
    .values({ ...rest, ...rewardColumns(reward, rewardCurrency) })
    .returning(AFFILIATE_COLUMNS);
  const created = rows[0];
  if (created === undefined) throw new Error("Affiliate insert returned no row");
  return toAffiliate(created);
}

export interface AffiliateUpdate extends AffiliateDetails {
  readonly id: string;
  readonly active: boolean;
}

/**
 * Changes anything about an affiliate. The reward is ours alone, so it may change at any time; earnings already
 * written keep the amount they were written with, and only later payments earn at the new rate.
 */
export async function updateAffiliate(db: Runner, input: AffiliateUpdate): Promise<Affiliate | null> {
  if (!isUuid(input.id)) return null;
  const { id, reward, rewardCurrency, ...rest } = input;
  const rows = await db
    .update(affiliates)
    .set({ ...rest, ...rewardColumns(reward, rewardCurrency) })
    .where(eq(affiliates.id, id))
    .returning(AFFILIATE_COLUMNS);
  const updated = rows[0];
  return updated === undefined ? null : toAffiliate(updated);
}

export async function findAffiliateById(db: Runner, id: string): Promise<Affiliate | null> {
  if (!isUuid(id)) return null;
  const rows = await db.select(AFFILIATE_COLUMNS).from(affiliates).where(eq(affiliates.id, id)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toAffiliate(row);
}

/** The currencies an affiliate's codes are in, for refusing a flat reward in a currency they cannot earn. */
export async function listAffiliateCodeCurrencies(db: Runner, affiliateId: string): Promise<BillingCurrency[]> {
  if (!isUuid(affiliateId)) return [];
  const rows = await db
    .selectDistinct({ currency: referralCodes.currency })
    .from(referralCodes)
    .where(eq(referralCodes.affiliateId, affiliateId));
  return rows.map((row) => row.currency);
}

/** An affiliate's money in one currency. Earned is owed plus paid; cancelled earnings count nowhere. */
export interface AffiliateTotals {
  readonly currency: BillingCurrency;
  readonly owedCents: number;
  readonly paidCents: number;
}

export interface ListedAffiliate extends Affiliate {
  /** Businesses that have paid on one of their codes. */
  readonly members: number;
  readonly totals: readonly AffiliateTotals[];
  /** They have chosen a password and can sign in to their own dashboard. */
  readonly signedUp: boolean;
}

/** Every affiliate, newest first, with how many members they brought and their money per currency. */
export async function listAffiliates(db: Runner, limit: number): Promise<ListedAffiliate[]> {
  const rows = await db
    .select(AFFILIATE_COLUMNS)
    .from(affiliates)
    .orderBy(desc(affiliates.createdAt), desc(affiliates.id))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const memberRows = await db
    .select({ affiliateId: referralCodes.affiliateId, members: count(sql`distinct ${subscriptions.businessId}`) })
    .from(subscriptions)
    .innerJoin(referralCodes, eq(referralCodes.id, subscriptions.referralCodeId))
    .where(and(inArray(referralCodes.affiliateId, ids), isNotNull(subscriptions.activatedAt)))
    .groupBy(referralCodes.affiliateId);
  const members = new Map(memberRows.map((row) => [row.affiliateId, row.members]));

  const totals = await totalsFor(db, ids);
  const signedUp = new Set(
    (await db.select({ id: affiliates.id }).from(affiliates).where(and(inArray(affiliates.id, ids), isNotNull(affiliates.userId)))).map(
      (row) => row.id,
    ),
  );
  return rows.map((row) => ({
    ...toAffiliate(row),
    members: members.get(row.id) ?? 0,
    totals: totals.get(row.id) ?? [],
    signedUp: signedUp.has(row.id),
  }));
}

async function totalsFor(db: Runner, affiliateIds: readonly string[]): Promise<Map<string, AffiliateTotals[]>> {
  const rows = await db
    .select({
      affiliateId: affiliateEarnings.affiliateId,
      currency: affiliateEarnings.currency,
      status: affiliateEarnings.status,
      total: sum(affiliateEarnings.amountCents).mapWith(Number),
    })
    .from(affiliateEarnings)
    .where(inArray(affiliateEarnings.affiliateId, [...affiliateIds]))
    .groupBy(affiliateEarnings.affiliateId, affiliateEarnings.currency, affiliateEarnings.status);

  const byAffiliate = new Map<string, Map<BillingCurrency, { owedCents: number; paidCents: number }>>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const currencies = byAffiliate.get(row.affiliateId) ?? new Map();
    const entry = currencies.get(row.currency) ?? { owedCents: 0, paidCents: 0 };
    if (row.status === "owed") entry.owedCents += row.total;
    else entry.paidCents += row.total;
    currencies.set(row.currency, entry);
    byAffiliate.set(row.affiliateId, currencies);
  }
  return new Map(
    [...byAffiliate].map(([id, currencies]) => [
      id,
      [...currencies].map(([currency, entry]) => ({ currency, ...entry })),
    ]),
  );
}

/** One affiliate's money per currency. */
export async function findAffiliateTotals(db: Runner, affiliateId: string): Promise<readonly AffiliateTotals[]> {
  if (!isUuid(affiliateId)) return [];
  return (await totalsFor(db, [affiliateId])).get(affiliateId) ?? [];
}

export interface AffiliateMember {
  readonly businessId: string;
  readonly businessName: string;
  readonly code: string;
  readonly since: Date;
  readonly status: SubscriptionStatus;
  readonly discountAmountCents: number;
}

/** The businesses that have paid on one of this affiliate's codes, newest first. */
export async function listAffiliateMembers(db: Runner, affiliateId: string, limit: number): Promise<AffiliateMember[]> {
  if (!isUuid(affiliateId)) return [];
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      code: referralCodes.code,
      since: subscriptions.activatedAt,
      status: subscriptions.status,
      discountAmountCents: subscriptions.discountAmountCents,
    })
    .from(subscriptions)
    .innerJoin(referralCodes, eq(referralCodes.id, subscriptions.referralCodeId))
    .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
    .where(and(eq(referralCodes.affiliateId, affiliateId), isNotNull(subscriptions.activatedAt)))
    .orderBy(desc(subscriptions.activatedAt))
    .limit(limit);
  return rows.flatMap((row) => (row.since === null ? [] : [{ ...row, since: row.since }]));
}

export interface AffiliateEarning {
  readonly id: string;
  readonly businessName: string;
  readonly code: string;
  readonly paymentKind: PaymentKind;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly basisCents: number;
  /** Which of the member's paid months it was. */
  readonly cycleNumber: number;
  readonly status: AffiliateEarningStatus;
  /** The payout that settled it, as staff entered it. Null unless `paid`. */
  readonly paidOn: string | null;
  readonly createdAt: Date;
}

/** An affiliate's earnings, newest first. */
export async function listAffiliateEarnings(db: Runner, affiliateId: string, limit: number): Promise<AffiliateEarning[]> {
  if (!isUuid(affiliateId)) return [];
  return db
    .select({
      id: affiliateEarnings.id,
      businessName: businesses.name,
      code: referralCodes.code,
      paymentKind: payments.kind,
      amountCents: affiliateEarnings.amountCents,
      currency: affiliateEarnings.currency,
      basisCents: affiliateEarnings.basisCents,
      cycleNumber: affiliateEarnings.cycleNumber,
      status: affiliateEarnings.status,
      paidOn: affiliatePayouts.paidOn,
      createdAt: affiliateEarnings.createdAt,
    })
    .from(affiliateEarnings)
    .innerJoin(businesses, eq(businesses.id, affiliateEarnings.businessId))
    .innerJoin(referralCodes, eq(referralCodes.id, affiliateEarnings.referralCodeId))
    .innerJoin(payments, eq(payments.id, affiliateEarnings.paymentId))
    .leftJoin(affiliatePayouts, eq(affiliatePayouts.id, affiliateEarnings.payoutId))
    .where(eq(affiliateEarnings.affiliateId, affiliateId))
    .orderBy(desc(affiliateEarnings.createdAt), desc(affiliateEarnings.id))
    .limit(limit);
}

export interface AffiliatePayout {
  readonly id: string;
  /** What was cashed out, before anything was kept back. */
  readonly amountCents: number;
  /** What staff kept back from the transfer, and why; zero and null when the whole amount was sent. */
  readonly withheldCents: number;
  readonly withheldReason: string | null;
  readonly currency: BillingCurrency;
  readonly paidOn: string;
  readonly reference: string;
  /** How many earnings it settled. */
  readonly earnings: number;
  readonly createdAt: Date;
}

export async function listAffiliatePayouts(db: Runner, affiliateId: string, limit: number): Promise<AffiliatePayout[]> {
  if (!isUuid(affiliateId)) return [];
  return db
    .select({
      id: affiliatePayouts.id,
      amountCents: affiliatePayouts.amountCents,
      withheldCents: affiliatePayouts.withheldCents,
      withheldReason: affiliatePayouts.withheldReason,
      currency: affiliatePayouts.currency,
      paidOn: affiliatePayouts.paidOn,
      reference: affiliatePayouts.reference,
      earnings: count(affiliateEarnings.id),
      createdAt: affiliatePayouts.createdAt,
    })
    .from(affiliatePayouts)
    .leftJoin(affiliateEarnings, eq(affiliateEarnings.payoutId, affiliatePayouts.id))
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .groupBy(affiliatePayouts.id)
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(limit);
}

/** Everything the payment path needs to work out an earning for a payment on a subscription. */
export interface AffiliateAccrualContext {
  readonly affiliateId: string;
  readonly referralCodeId: string;
  readonly businessId: string;
  readonly reward: ReferralReward;
  readonly rewardCurrency: BillingCurrency | null;
  /** How many of the member's paid months earn; null for all of them. */
  readonly rewardCycles: number | null;
  /** Which of the member's paid months this payment is: 1 for the first payment, 2 for the first renewal. */
  readonly cycleNumber: number;
  readonly planCurrency: BillingCurrency;
  readonly initialAmountCents: number;
  readonly recurringAmountCents: number;
  /** Frozen on the subscription when its checkout opened. */
  readonly discountAmountCents: number;
}

/**
 * The affiliate a subscription earns for, with what it takes to work out the earning for one of its payments, or null
 * when the subscription was opened with no code or with a coupon. The affiliate's reward and month limit are read as
 * they stand now, which is the rule: an edit changes what later payments earn.
 *
 * The month a payment is counts the subscription's applied payments up to and including it, in the order they were
 * paid. A payment that bought nothing (it carries an attention reason other than submission_failed) is not one of the
 * member's months, and nor is one whose earning staff cancelled (a refunded month): it does not use up the limit.
 */
export async function findAffiliateAccrualContext(
  db: Runner,
  subscriptionId: string,
  paymentId: string,
): Promise<AffiliateAccrualContext | null> {
  if (!isUuid(subscriptionId) || !isUuid(paymentId)) return null;
  const rows = await db
    .select({
      affiliateId: affiliates.id,
      referralCodeId: referralCodes.id,
      businessId: subscriptions.businessId,
      rewardKind: affiliates.rewardKind,
      rewardAmountCents: affiliates.rewardAmountCents,
      rewardPercentBasisPoints: affiliates.rewardPercentBasisPoints,
      rewardCurrency: affiliates.rewardCurrency,
      rewardCycles: affiliates.rewardCycles,
      planCurrency: plans.currency,
      initialAmountCents: plans.initialAmountCents,
      recurringAmountCents: plans.recurringAmountCents,
      discountAmountCents: subscriptions.discountAmountCents,
    })
    .from(subscriptions)
    .innerJoin(referralCodes, eq(referralCodes.id, subscriptions.referralCodeId))
    .innerJoin(affiliates, eq(affiliates.id, referralCodes.affiliateId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;

  const current = await db
    .select({ paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.subscriptionId, subscriptionId)))
    .limit(1);
  const paidAt = current[0]?.paidAt;
  if (paidAt === undefined || paidAt === null) throw new Error(`Payment ${paymentId} is not a paid payment of ${subscriptionId}`);
  const applied = or(isNull(payments.attentionReason), eq(payments.attentionReason, "submission_failed"));
  const upToThis = or(
    sql`${payments.paidAt} < ${paidAt}`,
    and(eq(payments.paidAt, paidAt), lte(payments.id, paymentId)),
  );
  const counted = await db
    .select({ months: count() })
    .from(payments)
    .where(and(eq(payments.subscriptionId, subscriptionId), eq(payments.status, "captured"), applied, upToThis));
  const cancelled = await db
    .select({ months: count() })
    .from(affiliateEarnings)
    .innerJoin(payments, eq(payments.id, affiliateEarnings.paymentId))
    .where(
      and(
        eq(payments.subscriptionId, subscriptionId),
        eq(affiliateEarnings.status, "cancelled"),
        sql`${payments.id} <> ${paymentId}`,
        upToThis,
      ),
    );
  const cycleNumber = Math.max(1, (counted[0]?.months ?? 1) - (cancelled[0]?.months ?? 0));

  const { rewardKind, rewardAmountCents, rewardPercentBasisPoints, ...rest } = row;
  return {
    ...rest,
    cycleNumber,
    reward: referralValueOf("reward", row.affiliateId, rewardKind, rewardAmountCents, rewardPercentBasisPoints),
  };
}

export interface NewAffiliateEarning {
  readonly affiliateId: string;
  readonly referralCodeId: string;
  readonly businessId: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly basisCents: number;
  readonly cycleNumber: number;
}

/**
 * Writes the earning for one payment. A payment earns once, ever: a second call for the same payment (a provider
 * delivering it twice) writes nothing and returns false.
 */
export async function insertAffiliateEarning(db: Runner, input: NewAffiliateEarning): Promise<boolean> {
  const rows = await db
    .insert(affiliateEarnings)
    .values(input)
    .onConflictDoNothing({ target: affiliateEarnings.paymentId })
    .returning({ id: affiliateEarnings.id });
  return rows.length > 0;
}

export interface AffiliateEarningCancellation {
  readonly affiliateId: string;
  readonly earningId: string;
  readonly staffUserId: string;
  readonly now: Date;
}

/**
 * Cancels an earning that is still owed, for instance because the member's payment was refunded. A paid earning is
 * money already sent and is never touched here. Returns false when there was no such owed earning.
 */
export async function cancelAffiliateEarning(db: Runner, input: AffiliateEarningCancellation): Promise<boolean> {
  if (!isUuid(input.affiliateId) || !isUuid(input.earningId)) return false;
  const rows = await db
    .update(affiliateEarnings)
    .set({ status: "cancelled", cancelledAt: input.now, cancelledByStaffId: input.staffUserId })
    .where(
      and(
        eq(affiliateEarnings.id, input.earningId),
        eq(affiliateEarnings.affiliateId, input.affiliateId),
        eq(affiliateEarnings.status, "owed"),
      ),
    )
    .returning({ id: affiliateEarnings.id });
  return rows.length > 0;
}

export interface NewAffiliatePayout {
  readonly affiliateId: string;
  readonly currency: BillingCurrency;
  /**
   * The owed earnings the staff member saw and is paying, by id. The payout is refused unless these are exactly the
   * affiliate's owed earnings in this currency at the moment it is saved, so a payment that earned in between (or an
   * earning cancelled in between) can never be settled by a transfer that did not include it.
   */
  readonly earningIds: readonly string[];
  /** `YYYY-MM-DD`. */
  readonly paidOn: string;
  readonly reference: string;
  /** What is kept back from the transfer, in minor units (0 for none); less than the whole amount being paid. */
  readonly withheldCents: number;
  /** Why it is kept back: required when `withheldCents` is above zero, and null otherwise. */
  readonly withheldReason: string | null;
  readonly recordedByStaffId: string;
}

export type AffiliatePayoutOutcome =
  | { readonly kind: "recorded"; readonly payoutId: string; readonly amountCents: number }
  /** What is owed changed since the page was drawn. Nothing was written. */
  | { readonly kind: "stale" }
  | { readonly kind: "nothing-owed" }
  /** What staff asked to withhold is not a whole number below what is being paid. Nothing was written. */
  | { readonly kind: "bad-withheld" };

/** Records a transfer that settles everything an affiliate is owed in one currency, in one transaction. */
export async function recordAffiliatePayout(db: Runner, input: NewAffiliatePayout): Promise<AffiliatePayoutOutcome> {
  if (!isUuid(input.affiliateId) || !input.earningIds.every(isUuid)) return { kind: "stale" };
  return db.transaction(async (tx): Promise<AffiliatePayoutOutcome> => {
    const owed = await tx
      .select({ id: affiliateEarnings.id, amountCents: affiliateEarnings.amountCents })
      .from(affiliateEarnings)
      .where(
        and(
          eq(affiliateEarnings.affiliateId, input.affiliateId),
          eq(affiliateEarnings.currency, input.currency),
          eq(affiliateEarnings.status, "owed"),
        ),
      )
      .for("update");
    if (owed.length === 0) return { kind: "nothing-owed" };
    const seen = new Set(input.earningIds);
    if (owed.length !== seen.size || !owed.every((earning) => seen.has(earning.id))) return { kind: "stale" };

    const amountCents = owed.reduce((total, earning) => total + earning.amountCents, 0);
    const reason = input.withheldReason?.trim() ?? "";
    // Checked here, against the amount worked out in this transaction, so the table's check never has to refuse it.
    if (
      !Number.isSafeInteger(input.withheldCents) ||
      input.withheldCents < 0 ||
      input.withheldCents >= amountCents ||
      (input.withheldCents === 0) !== (reason === "") ||
      reason.length > 200
    ) {
      return { kind: "bad-withheld" };
    }
    const inserted = await tx
      .insert(affiliatePayouts)
      .values({
        affiliateId: input.affiliateId,
        amountCents,
        withheldCents: input.withheldCents,
        withheldReason: reason === "" ? null : reason,
        currency: input.currency,
        paidOn: input.paidOn,
        reference: input.reference,
        recordedByStaffId: input.recordedByStaffId,
      })
      .returning({ id: affiliatePayouts.id });
    const payout = inserted[0];
    if (payout === undefined) throw new Error("Affiliate payout insert returned no row");
    await tx
      .update(affiliateEarnings)
      .set({ status: "paid", payoutId: payout.id })
      .where(inArray(affiliateEarnings.id, owed.map((earning) => earning.id)));
    return { kind: "recorded", payoutId: payout.id, amountCents };
  });
}

/** The ids of an affiliate's owed earnings in one currency, which a payout form carries so it can be checked. */
export async function listOwedEarningIds(db: Runner, affiliateId: string, currency: BillingCurrency): Promise<string[]> {
  if (!isUuid(affiliateId)) return [];
  const rows = await db
    .select({ id: affiliateEarnings.id })
    .from(affiliateEarnings)
    .where(
      and(
        eq(affiliateEarnings.affiliateId, affiliateId),
        eq(affiliateEarnings.currency, currency),
        eq(affiliateEarnings.status, "owed"),
      ),
    )
    .orderBy(affiliateEarnings.id);
  return rows.map((row) => row.id);
}

/**
 * An affiliate's sign-in, from the staff console's side: whether they have opened one, and until when the link staff
 * last sent them works.
 */
export interface AffiliateLoginState {
  readonly signedUp: boolean;
  /** When the open login link stops working; null when no link is open or it has already lapsed. */
  readonly linkExpiresAt: Date | null;
}

export async function findAffiliateLoginState(
  db: Runner,
  affiliateId: string,
  now: Date = new Date(),
): Promise<AffiliateLoginState | null> {
  if (!isUuid(affiliateId)) return null;
  const rows = await db
    .select({ userId: affiliates.userId, expiresAt: affiliates.loginTokenExpiresAt })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { signedUp: row.userId !== null, linkExpiresAt: row.expiresAt !== null && row.expiresAt > now ? row.expiresAt : null };
}

export type AffiliateLoginLinkOutcome =
  /** `token` goes in the link and is never stored: only its hash is. */
  | { readonly kind: "issued"; readonly token: string; readonly expiresAt: Date }
  | { readonly kind: "no-email" }
  | { readonly kind: "not-found" };

const LOGIN_TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Opens a login link for the affiliate, replacing any link already open. They sign in with their email, so one without
 * an email gets no link. The same link serves a first sign-in and a forgotten password (see claimAffiliateLoginLink).
 */
export async function issueAffiliateLoginLink(
  db: Runner,
  input: { readonly affiliateId: string; readonly expiresInDays: number; readonly now?: Date },
): Promise<AffiliateLoginLinkOutcome> {
  if (!isUuid(input.affiliateId)) return { kind: "not-found" };
  const token = randomBytes(LOGIN_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date((input.now ?? new Date()).getTime() + input.expiresInDays * MILLISECONDS_PER_DAY);
  const rows = await db
    .update(affiliates)
    .set({ loginTokenHash: hashInviteToken(token), loginTokenExpiresAt: expiresAt })
    .where(and(eq(affiliates.id, input.affiliateId), isNotNull(affiliates.email)))
    .returning({ id: affiliates.id });
  if (rows.length > 0) return { kind: "issued", token, expiresAt };
  const exists = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, input.affiliateId)).limit(1);
  return exists.length === 0 ? { kind: "not-found" } : { kind: "no-email" };
}

/** Who a login link is for, as the page that redeems it needs to know. */
export interface AffiliateLoginInvite {
  readonly affiliateId: string;
  readonly name: string;
  /** The address they sign in with. */
  readonly email: string;
  /** Set when they already have a sign-in: the link then chooses a new password for it. */
  readonly userId: string | null;
}

/** The affiliate a login link is for, while the link is open and unexpired. */
export async function findAffiliateLoginInvite(
  db: Runner,
  token: string,
  now: Date = new Date(),
  lock?: "update",
): Promise<AffiliateLoginInvite | null> {
  const query = db
    .select({ affiliateId: affiliates.id, name: affiliates.name, email: affiliates.email, userId: affiliates.userId })
    .from(affiliates)
    .where(and(eq(affiliates.loginTokenHash, hashInviteToken(token)), gt(affiliates.loginTokenExpiresAt, now)))
    .limit(1);
  // Only redemption requests lock: a waiter rechecks the token after the winner commits.
  const rows = await (lock === "update" ? query.for("update") : query);
  const row = rows[0];
  if (row === undefined || row.email === null) return null;
  return { affiliateId: row.affiliateId, name: row.name, email: row.email, userId: row.userId };
}

/**
 * Closes a login link and ties its affiliate to the account that followed it, in one statement: of two submissions of
 * the same link, one wins and the other finds it `closed`. `user-taken` means that account already belongs to a
 * different affiliate; the link stays open.
 */
export async function claimAffiliateLoginLink(
  db: Runner,
  input: { readonly token: string; readonly userId: string; readonly now?: Date },
): Promise<"claimed" | "closed" | "user-taken"> {
  try {
    const rows = await db
      .update(affiliates)
      .set({ userId: input.userId, loginTokenHash: null, loginTokenExpiresAt: null })
      .where(
        and(
          eq(affiliates.loginTokenHash, hashInviteToken(input.token)),
          gt(affiliates.loginTokenExpiresAt, input.now ?? new Date()),
        ),
      )
      .returning({ id: affiliates.id });
    return rows.length > 0 ? "claimed" : "closed";
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return "user-taken";
    throw error;
  }
}

/**
 * Resets the credential account and ends its sessions inside the transaction that holds the affiliate's token lock.
 * The hash comes from Better Auth's configured password hasher. Match its internal adapter's three account keys.
 * Refuse missing or ambiguous credential rows before changing anything; a failed reset rolls the token claim back.
 */
export async function resetAffiliateCredentialPassword(tx: ScopedTransaction, userId: string, passwordHash: string): Promise<void> {
  if (passwordHash.length === 0) throw new RangeError("An affiliate password hash cannot be empty.");
  const predicate = and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"), eq(accounts.accountId, userId));
  const credentials = await tx.select({ id: accounts.id, password: accounts.password }).from(accounts).where(predicate).for("update");
  if (credentials.length !== 1 || credentials[0]?.password === null) {
    throw new Error("An affiliate reset requires exactly one existing password credential.");
  }
  await tx.update(accounts).set({ password: passwordHash, updatedAt: new Date() }).where(predicate);
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

/** The affiliate a signed-in user is, or null for anyone who is not one. The key to their own dashboard. */
export async function findAffiliateByUserId(db: Runner, userId: string): Promise<Affiliate | null> {
  const rows = await db.select(AFFILIATE_COLUMNS).from(affiliates).where(eq(affiliates.userId, userId)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toAffiliate(row);
}

/**
 * An affiliate's money in one currency, in the order it happens: earned, then cashed out (a payout settles earnings),
 * of which some may have been kept back (withheld) and the rest received. Earned is what is owed plus what was cashed
 * out; earnings cancelled after a refund count in none of them and are shown on their own.
 */
export interface AffiliateCashOut {
  readonly currency: BillingCurrency;
  readonly earnedCents: number;
  /** Earned and not yet cashed out. */
  readonly pendingCents: number;
  /** Cashed out, before anything was kept back. */
  readonly cashedOutCents: number;
  /** Kept back from what was cashed out (tax deducted at source, a bank fee). */
  readonly withheldCents: number;
  /** What reached them: cashed out less withheld. */
  readonly receivedCents: number;
  readonly cancelledCents: number;
}

/** One affiliate's cash-out figures, per currency, for the currencies they have earned or been paid in. */
export async function findAffiliateCashOut(db: Runner, affiliateId: string): Promise<readonly AffiliateCashOut[]> {
  if (!isUuid(affiliateId)) return [];
  const earnings = await db
    .select({
      currency: affiliateEarnings.currency,
      status: affiliateEarnings.status,
      total: sum(affiliateEarnings.amountCents).mapWith(Number),
    })
    .from(affiliateEarnings)
    .where(eq(affiliateEarnings.affiliateId, affiliateId))
    .groupBy(affiliateEarnings.currency, affiliateEarnings.status);
  const payouts = await db
    .select({
      currency: affiliatePayouts.currency,
      cashedOut: sum(affiliatePayouts.amountCents).mapWith(Number),
      withheld: sum(affiliatePayouts.withheldCents).mapWith(Number),
    })
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .groupBy(affiliatePayouts.currency);

  const byCurrency = new Map<BillingCurrency, { owed: number; paid: number; cancelled: number; cashedOut: number; withheld: number }>();
  const entry = (currency: BillingCurrency) => {
    const existing = byCurrency.get(currency) ?? { owed: 0, paid: 0, cancelled: 0, cashedOut: 0, withheld: 0 };
    byCurrency.set(currency, existing);
    return existing;
  };
  for (const row of earnings) {
    const figures = entry(row.currency);
    if (row.status === "owed") figures.owed += row.total;
    else if (row.status === "paid") figures.paid += row.total;
    else figures.cancelled += row.total;
  }
  for (const row of payouts) {
    const figures = entry(row.currency);
    figures.cashedOut += row.cashedOut;
    figures.withheld += row.withheld;
  }
  return [...byCurrency].map(([currency, figures]) => ({
    currency,
    earnedCents: figures.owed + figures.paid,
    pendingCents: figures.owed,
    cashedOutCents: figures.cashedOut,
    withheldCents: figures.withheld,
    receivedCents: figures.cashedOut - figures.withheld,
    cancelledCents: figures.cancelled,
  }));
}

/**
 * A payment that was not refunded. Nothing marks a payment itself refunded: staff cancel the earning it made (the
 * affiliate page's Cancel), so a payment whose earning was cancelled is the refunded one. A payment that made no earning
 * (a code whose reward is nothing) cannot be told apart, and counts.
 */
const notRefunded = sql`not exists (select 1 from ${affiliateEarnings} where ${affiliateEarnings.paymentId} = ${payments.id} and ${affiliateEarnings.status} = 'cancelled')`;

/** How one of an affiliate's codes has been used. */
export interface AffiliateCodeUsage {
  readonly codeId: string;
  /** Businesses that have paid on it. */
  readonly members: number;
  /** Payments they have made and kept that took the code's discount off. */
  readonly payments: number;
  /** What the code has taken off so far: each member's frozen monthly discount times the payments they kept (a refunded one gave it back). Before GST. */
  readonly discountGivenCents: number;
}

/**
 * Usage of each of an affiliate's codes: who paid on it, and how much discount it has given. A payment counts when it
 * was applied (it carries no attention reason, or only a failed submission): the same rule that decides which payments
 * are a member's months for the affiliate's reward.
 */
export async function listAffiliateCodeUsage(db: Runner, affiliateId: string): Promise<AffiliateCodeUsage[]> {
  if (!isUuid(affiliateId)) return [];
  const applied = db
    .select({ subscriptionId: payments.subscriptionId, total: count().as("total") })
    .from(payments)
    .where(
      and(
        eq(payments.status, "captured"),
        or(isNull(payments.attentionReason), eq(payments.attentionReason, "submission_failed")),
        notRefunded,
      ),
    )
    .groupBy(payments.subscriptionId)
    .as("applied_payments");
  const rows = await db
    .select({
      codeId: referralCodes.id,
      members: count(sql`distinct ${subscriptions.businessId}`),
      payments: sql<number>`coalesce(sum(${applied.total}), 0)`.mapWith(Number),
      discountGivenCents: sql<number>`coalesce(sum(${subscriptions.discountAmountCents} * ${applied.total}), 0)`.mapWith(Number),
    })
    .from(referralCodes)
    .innerJoin(subscriptions, and(eq(subscriptions.referralCodeId, referralCodes.id), isNotNull(subscriptions.activatedAt)))
    .leftJoin(applied, eq(applied.subscriptionId, subscriptions.id))
    .where(eq(referralCodes.affiliateId, affiliateId))
    .groupBy(referralCodes.id);
  return rows;
}

/** What happened on an affiliate's codes in one calendar month, in one currency. */
export interface AffiliateMonthlyActivity {
  /** `YYYY-MM`, in India's calendar (the affiliate and staff both read dates there). */
  readonly month: string;
  readonly currency: BillingCurrency;
  /** Members who paid that month and kept it: each business counted once however many times it paid. */
  readonly payingMembers: number;
  /** What the affiliate earned from those payments (a refunded payment's earning is cancelled and left out). */
  readonly cents: number;
  /** Payments that month that were refunded, which count in neither of the above. */
  readonly refunded: number;
}

/**
 * An affiliate's month by month, since `since`, oldest first: who paid, what it earned them, and what was refunded. A
 * month is the month the member's payment was made. Applied payments only (the rule that decides which payments earn).
 */
export async function listAffiliateMonthlyActivity(db: Runner, affiliateId: string, since: Date): Promise<AffiliateMonthlyActivity[]> {
  if (!isUuid(affiliateId)) return [];
  const month = sql<string>`to_char(${payments.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM')`;
  const refundedPayment = sql`${affiliateEarnings.status} = 'cancelled'`;
  const rows = await db
    .select({
      month,
      currency: referralCodes.currency,
      payingMembers: sql<number>`count(distinct ${subscriptions.businessId}) filter (where ${affiliateEarnings.status} is distinct from 'cancelled')`.mapWith(Number),
      cents: sql<number>`coalesce(sum(${affiliateEarnings.amountCents}) filter (where ${affiliateEarnings.status} is distinct from 'cancelled'), 0)`.mapWith(Number),
      refunded: sql<number>`count(*) filter (where ${refundedPayment})`.mapWith(Number),
    })
    .from(payments)
    .innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
    .innerJoin(referralCodes, eq(referralCodes.id, subscriptions.referralCodeId))
    .leftJoin(affiliateEarnings, eq(affiliateEarnings.paymentId, payments.id))
    .where(
      and(
        eq(referralCodes.affiliateId, affiliateId),
        eq(payments.status, "captured"),
        or(isNull(payments.attentionReason), eq(payments.attentionReason, "submission_failed")),
        sql`${payments.paidAt} >= ${since}`,
      ),
    )
    .groupBy(month, referralCodes.currency)
    .orderBy(month);
  return rows;
}
