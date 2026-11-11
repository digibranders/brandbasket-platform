import type { BillingInterval, Subscription } from "@brandbasket/db";

const MS_PER_DAY = 86_400_000;

type ChargeDates = Pick<Subscription, "commitmentEndsAt" | "paidThroughAt">;

/** When the next charge falls: the end of the paid-up-front term, or the end of the period paid for after it. */
export function nextPaymentDate(subscription: ChargeDates, now: Date): Date | null {
  const { commitmentEndsAt, paidThroughAt } = subscription;
  if (commitmentEndsAt !== null && commitmentEndsAt.getTime() > now.getTime()) return commitmentEndsAt;
  return paidThroughAt;
}

/** Whether the first payment's term is still running, so the first renewal has not come yet. */
export function inFirstTerm(subscription: Pick<Subscription, "commitmentEndsAt">, now: Date): boolean {
  return subscription.commitmentEndsAt !== null && subscription.commitmentEndsAt.getTime() > now.getTime();
}

/** How far through the period the customer has paid for they are, in whole days. */
export interface PeriodProgress {
  readonly start: Date;
  readonly end: Date;
  readonly elapsedDays: number;
  readonly totalDays: number;
}

/**
 * `from` less `months` calendar months, in UTC, with the day clamped to the end of a shorter month: the start of a monthly
 * (1) or yearly (12) period that ends on `from`. The mirror of addMonthsUtc in @brandbasket/billing, which only counts forwards.
 */
function monthsBefore(from: Date, months: number): Date {
  const targetMonthIndex = from.getUTCMonth() - months;
  const lastDayOfTarget = new Date(Date.UTC(from.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
  const result = new Date(from.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(targetMonthIndex);
  result.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTarget));
  return result;
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * The period the customer is in: the paid-up-front term while it runs (it starts the day the plan did), then each
 * month after it, ending on the next payment date. Null before the plan has started or when nothing is paid through,
 * because a bar with no ends would be a guess.
 */
export function billingPeriodProgress(
  subscription: Pick<Subscription, "activatedAt" | "commitmentEndsAt" | "paidThroughAt"> & { readonly billingInterval?: BillingInterval },
  now: Date,
): PeriodProgress | null {
  const { activatedAt } = subscription;
  const end = nextPaymentDate(subscription, now);
  if (activatedAt === null || end === null || end.getTime() <= activatedAt.getTime()) return null;

  const inFirstTerm = subscription.commitmentEndsAt !== null && end.getTime() === subscription.commitmentEndsAt.getTime();
  // A yearly subscription's period after its first is the year before its next payment.
  const monthStart = monthsBefore(end, subscription.billingInterval === "year" ? 12 : 1);
  const start = inFirstTerm || monthStart.getTime() < activatedAt.getTime() ? activatedAt : monthStart;

  const totalDays = Math.max(1, wholeDaysBetween(start, end));
  const elapsedDays = Math.min(totalDays, Math.max(0, wholeDaysBetween(start, now)));
  return { start, end, elapsedDays, totalDays };
}
