import { and, count, desc, eq, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  accountClosures,
  accountExitFeedback,
  businesses,
  subscriptions,
  type AccountExitOutcome,
  type AccountExitReason,
} from "../schema";
import { isUuid } from "./tenant";

/*
 * Leaving: the feedback an owner gives on the way out, the stay offer's discount, and the closure that locks an
 * account until its grace period ends. All of it runs on the staff connection, after the platform has checked the
 * signed-in customer: the customer's own database role has no grant on any of it.
 */

/** Writes run on their own and inside a transaction, so closing an account can be one all-or-nothing step. */
type Runner = Database | ScopedTransaction;

export interface NewExitFeedback {
  readonly reason: AccountExitReason;
  /** Already trimmed; null when they typed nothing. */
  readonly comment: string | null;
  readonly planCode: string | null;
  readonly offerPercent: number | null;
  readonly outcome: AccountExitOutcome;
}

export async function insertExitFeedback(db: Runner, input: NewExitFeedback): Promise<void> {
  await db.insert(accountExitFeedback).values(input);
}

export interface AccountClosure {
  readonly id: string;
  readonly userId: string;
  readonly businessId: string;
  readonly requestedAt: Date;
  readonly eraseAfter: Date;
}

const CLOSURE_COLUMNS = {
  id: accountClosures.id,
  userId: accountClosures.userId,
  businessId: accountClosures.businessId,
  requestedAt: accountClosures.requestedAt,
  eraseAfter: accountClosures.eraseAfter,
} as const;

const OPEN = (userId: string) =>
  and(eq(accountClosures.userId, userId), isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt));

/** The user's open closure, or null when their account is not scheduled for deletion. */
export async function findOpenClosureForUser(db: Runner, userId: string): Promise<AccountClosure | null> {
  const rows = await db.select(CLOSURE_COLUMNS).from(accountClosures).where(OPEN(userId)).limit(1);
  return rows[0] ?? null;
}

export interface NewAccountClosure {
  readonly userId: string;
  readonly businessId: string;
  readonly now: Date;
  readonly eraseAfter: Date;
}

/**
 * Opens a closure for the user. Asking twice is harmless: the one open closure a user may have is returned as it
 * stands, so a double click or a retry cannot move the erase date.
 */
export async function openAccountClosure(db: Runner, input: NewAccountClosure): Promise<AccountClosure> {
  const inserted = await db
    .insert(accountClosures)
    .values({ userId: input.userId, businessId: input.businessId, requestedAt: input.now, eraseAfter: input.eraseAfter })
    .onConflictDoNothing()
    .returning(CLOSURE_COLUMNS);
  const row = inserted[0] ?? (await findOpenClosureForUser(db, input.userId));
  if (row === null) throw new Error("An account closure was neither inserted nor found.");
  return row;
}

/** Cancels the user's open closure. False when there was none, so the caller can tell a restore from a no-op. */
export async function restoreAccountClosure(db: Runner, input: { readonly userId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(accountClosures)
    .set({ restoredAt: input.now })
    .where(OPEN(input.userId))
    .returning({ id: accountClosures.id });
  return rows.length > 0;
}

export interface RetentionDiscount {
  readonly subscriptionId: string;
  readonly businessId: string;
  /** The stay offer's worth against the plan's net monthly price, in minor units. */
  readonly retentionDiscountCents: number;
}

/**
 * Puts a stay offer on a subscription: its worth is added to whatever a referral code already takes off. An offer is
 * taken once, so the update matches only a subscription that has none. False when it matched nothing (the offer was
 * already taken, or the subscription is not that business's).
 */
export async function applyRetentionDiscount(db: Runner, input: RetentionDiscount): Promise<boolean> {
  if (!isUuid(input.subscriptionId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(subscriptions)
    .set({
      retentionDiscountCents: input.retentionDiscountCents,
      discountAmountCents: sql`${subscriptions.discountAmountCents} + ${input.retentionDiscountCents}`,
    })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.businessId, input.businessId),
        eq(subscriptions.retentionDiscountCents, 0),
      ),
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

/**
 * Records that the customer asked for the plan to end with the period they have paid for. The provider does the
 * ending; this is our note of the request, so the billing page can say so before the provider's own event arrives.
 * A cancelled subscription has no package left: the monthly ad credit goes to 0 and the business gives the package offer up
 * for good, so a return is at list (docs/plans/16-platform-pricing-offers.md). Both are written in the same step as the
 * note, and the first date of each is kept.
 */
export async function markCancelRequested(
  db: Runner,
  input: { readonly subscriptionId: string; readonly businessId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.subscriptionId) || !isUuid(input.businessId)) return false;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(subscriptions)
      .set({ cancelRequestedAt: sql`coalesce(${subscriptions.cancelRequestedAt}, ${input.now})`, adCreditCents: 0 })
      .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.businessId, input.businessId)))
      .returning({ id: subscriptions.id });
    if (rows.length === 0) return false;
    await tx
      .update(businesses)
      .set({ packageOfferForfeitedAt: sql`coalesce(${businesses.packageOfferForfeitedAt}, ${input.now})` })
      .where(eq(businesses.id, input.businessId));
    return true;
  });
}

/**
 * A condition for a public read of businesses: true unless the business's account is closing (its owner asked to
 * delete it and the grace period is not over or not yet acted on). A closing account is locked, so what it published
 * is taken down from the website's feed and ads until it is restored, and goes for good when it is erased. `businessId`
 * must be a column of a table already joined in the query, so it is written qualified.
 */
export function businessNotClosing(businessId: AnyColumn): SQL {
  return sql`not exists (select 1 from ${accountClosures} where ${accountClosures.businessId} = ${businessId} and ${accountClosures.restoredAt} is null and ${accountClosures.erasedAt} is null)`;
}

// ── Staff: what people said on the way out ──────────────────────────────────────────────────────────────────────

export interface ExitFeedbackRow {
  readonly id: string;
  readonly reason: AccountExitReason;
  readonly comment: string | null;
  readonly planCode: string | null;
  readonly offerPercent: number | null;
  readonly outcome: AccountExitOutcome;
  readonly createdAt: Date;
}

/** The newest feedback first. It names nobody: the table keeps no user or business. Staff connection. */
export async function listExitFeedback(db: Runner, limit: number): Promise<ExitFeedbackRow[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`The limit must be a positive whole number, received ${limit}`);
  return db
    .select({
      id: accountExitFeedback.id,
      reason: accountExitFeedback.reason,
      comment: accountExitFeedback.comment,
      planCode: accountExitFeedback.planCode,
      offerPercent: accountExitFeedback.offerPercent,
      outcome: accountExitFeedback.outcome,
      createdAt: accountExitFeedback.createdAt,
    })
    .from(accountExitFeedback)
    .orderBy(desc(accountExitFeedback.createdAt), desc(accountExitFeedback.id))
    .limit(limit);
}

export interface ExitFeedbackSummary {
  readonly total: number;
  readonly deleted: number;
  readonly keptWithOffer: number;
  /** Every reason that has been given, most common first. */
  readonly byReason: readonly { readonly reason: AccountExitReason; readonly count: number }[];
  /** Accounts that asked to be deleted and have been neither restored nor erased yet. */
  readonly waitingToErase: number;
}

export async function summariseExitFeedback(db: Runner): Promise<ExitFeedbackSummary> {
  const reasons = await db
    .select({ reason: accountExitFeedback.reason, outcome: accountExitFeedback.outcome, n: count() })
    .from(accountExitFeedback)
    .groupBy(accountExitFeedback.reason, accountExitFeedback.outcome);
  const open = await db
    .select({ n: count() })
    .from(accountClosures)
    .where(and(isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt)));
  const perReason = new Map<AccountExitReason, number>();
  let deleted = 0;
  let keptWithOffer = 0;
  for (const row of reasons) {
    perReason.set(row.reason, (perReason.get(row.reason) ?? 0) + row.n);
    if (row.outcome === "deleted") deleted += row.n;
    else keptWithOffer += row.n;
  }
  return {
    total: deleted + keptWithOffer,
    deleted,
    keptWithOffer,
    byReason: [...perReason].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    waitingToErase: open[0]?.n ?? 0,
  };
}
