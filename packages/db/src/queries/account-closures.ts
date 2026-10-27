import { and, asc, count, desc, eq, isNull, min, sql, type AnyColumn, type SQL } from "drizzle-orm";
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
 * Leaving: the feedback an owner gives on the way out, and the closure that locks an account until its grace period
 * ends. All of it runs on the staff connection, after the platform has checked the
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

/** Cancels the business's open closure, for the provider's confirmation of a kept plan, which has no signed-in user. False when there was none. */
export async function restoreAccountClosureForBusiness(db: Runner, input: { readonly businessId: string; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(accountClosures)
    .set({ restoredAt: input.now })
    .where(and(eq(accountClosures.businessId, input.businessId), isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt)))
    .returning({ id: accountClosures.id });
  return rows.length > 0;
}

// ── Staff: accounts that are leaving ────────────────────────────────────────────────────────────────────────────

export interface OpenClosure {
  readonly businessId: string;
  readonly requestedAt: Date;
  readonly eraseAfter: Date;
}

const OPEN_FOR_BUSINESS = (businessId: string) =>
  and(eq(accountClosures.businessId, businessId), isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt));

/** Every account waiting to be erased, the soonest first. Staff connection. */
export async function listOpenClosures(db: Runner): Promise<readonly OpenClosure[]> {
  return db
    .select({ businessId: accountClosures.businessId, requestedAt: accountClosures.requestedAt, eraseAfter: accountClosures.eraseAfter })
    .from(accountClosures)
    .where(and(isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt)))
    .orderBy(asc(accountClosures.eraseAfter), asc(accountClosures.id));
}

/** The business's open closure, or null when it is not leaving. */
export async function findOpenClosureForBusiness(db: Runner, businessId: string): Promise<AccountClosure | null> {
  if (!isUuid(businessId)) return null;
  const rows = await db.select(CLOSURE_COLUMNS).from(accountClosures).where(OPEN_FOR_BUSINESS(businessId)).limit(1);
  return rows[0] ?? null;
}

/** The most a staff member may push an erase date out by in one go. */
export const MAX_CLOSURE_EXTENSION_DAYS = 90;

/** Pushes the open closure's erase date out by whole days. False when there is no open closure or `days` is out of range. */
export async function extendAccountClosure(db: Runner, input: { readonly businessId: string; readonly days: number }): Promise<boolean> {
  if (!isUuid(input.businessId) || !Number.isInteger(input.days) || input.days < 1 || input.days > MAX_CLOSURE_EXTENSION_DAYS) return false;
  const rows = await db
    .update(accountClosures)
    .set({ eraseAfter: sql`${accountClosures.eraseAfter} + make_interval(days => ${input.days})` })
    .where(OPEN_FOR_BUSINESS(input.businessId))
    .returning({ id: accountClosures.id });
  return rows.length > 0;
}

/**
 * Records that the customer asked for the plan to end with the period they have paid for. The provider does the
 * ending; this is our note of the request, so the billing page can say so before the provider's own event arrives.
 * The monthly ad credit and the package price run to the end of that paid month, so neither is touched here: the credit stops
 * when the provider's cancel lands (updateSubscriptionProviderStatus), and the package offer is forfeited when the customer
 * comes back after cancelling (the checkout that reopens the plan). The first date of the request is kept.
 */
export async function markCancelRequested(
  db: Runner,
  input: { readonly subscriptionId: string; readonly businessId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.subscriptionId) || !isUuid(input.businessId)) return false;
  const rows = await db
    .update(subscriptions)
    .set({ cancelRequestedAt: sql`coalesce(${subscriptions.cancelRequestedAt}, ${input.now})` })
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.businessId, input.businessId)))
    .returning({ id: subscriptions.id });
  return rows.length > 0;
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

export interface OpenClosureSummary {
  readonly count: number;
  /** When the next closing account is erased, or null when none is waiting. */
  readonly nextEraseAfter: Date | null;
}

/** How many closed accounts are inside their grace period, for the Compliance page. Use with the staff connection. */
export async function summariseOpenClosures(db: Runner): Promise<OpenClosureSummary> {
  const rows = await db
    .select({ value: count(), next: min(accountClosures.eraseAfter) })
    .from(accountClosures)
    .where(and(isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt)));
  return { count: Number(rows[0]?.value ?? 0), nextEraseAfter: rows[0]?.next ?? null };
}

