import type { AddOnSubscription, Subscription } from "@brandbasket/db";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageBasisPointsFor } from "@brandbasket/shared/lib/billing/packages";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/*
 * The decisions behind the Delete account page, free of the database and the provider so each can be tested alone:
 * what leaving ends, what it does to the plan and when the data is erased.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASIS_POINTS_PER_PERCENT = 100;

/**
 * What cancelling takes from a business that holds a package, as the lines the Delete account page lists before the
 * customer confirms: the package price, the monthly ad credit when it has one, and the full price on a return. They run to the
 * end of the paid month; coming back after cancelling gives the package offer up for good (the reactivation checkout), so
 * these are exactly what is lost.
 * Empty for one service and for a business that has already forfeited, which has no package to lose.
 */
export function packageEndsFor(input: {
  /** The services that are staying, not ones already set to end. */
  readonly services: readonly MonthlyAddOnId[];
  readonly forfeited: boolean;
  /** The ad credit a month frozen on the subscription, in minor units. */
  readonly adCreditCents: number;
  readonly currency: MoneyCurrency;
}): string[] {
  const basisPoints = packageBasisPointsFor({ services: input.services, forfeited: input.forfeited });
  if (basisPoints === 0) return [];
  return [
    `Your package price (${basisPoints / BASIS_POINTS_PER_PERCENT}% off)`,
    ...(input.adCreditCents > 0 ? [`${formatMoney(input.adCreditCents, input.currency)} a month of ad credit`] : []),
    "If you come back, every service is at its own price",
  ];
}

/**
 * What closing the account does to the plan:
 * - `none`: nothing to end (no subscription, or it is already over).
 * - `already-ending`: the plan was already set to end with its period.
 * - `drop-unpaid`: an unpaid checkout, cancelled outright so it can never take money for a closed account.
 * - `end-with-period`: a paid plan at a provider, ended with the period the customer has paid for.
 * - `note-only`: a plan the team collects by hand; we note the request and the team stops collecting.
 */
export type PlanClosure = "none" | "already-ending" | "drop-unpaid" | "end-with-period" | "note-only";

export function planClosureFor(subscription: Subscription | null): PlanClosure {
  if (subscription === null || subscription.status === "cancelled") return "none";
  if (subscription.status === "incomplete") return subscription.provider === "manual" ? "none" : "drop-unpaid";
  if (subscription.cancelRequestedAt !== null) return "already-ending";
  return subscription.provider === "manual" ? "note-only" : "end-with-period";
}

/**
 * When a closed account's personal data may be erased: the grace period after the service ends. A member keeps what
 * they paid for until the end of their paid period, so the countdown starts then, not at the request.
 */
export function eraseAfterFor(subscription: Subscription | null, now: Date): Date {
  const paidThrough = subscription?.paidThroughAt ?? null;
  const serviceEnds = paidThrough !== null && paidThrough.getTime() > now.getTime() ? paidThrough : now;
  return new Date(serviceEnds.getTime() + ACCOUNT_CLOSURE_GRACE_DAYS * MS_PER_DAY);
}

/**
 * Whether the business has an add-on that is paying or about to: active, past due (the provider is still retrying) or a
 * kept one waiting for its start date. The Delete account page then says the add-ons stop at the end of the paid month.
 * An unpaid checkout, a halted add-on and a cancelled one are not running.
 */
export function hasRunningAddOns(rows: readonly Pick<AddOnSubscription, "status">[]): boolean {
  return rows.some((row) => row.status === "active" || row.status === "past_due" || row.status === "scheduled");
}
