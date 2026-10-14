import type { AccountExitReason, AddOnSubscription, Plan, Subscription } from "@firstfold/db";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "@firstfold/db";
import { retentionDiscountCentsFor, retentionOfferPercent } from "@firstfold/shared/lib/account-exit";

/*
 * The decisions behind the Delete account page, free of the database and the provider so each can be tested alone:
 * whether a stay offer is open to a member, and what leaving does to the plan and to the erase date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetentionOfferTerms {
  readonly percent: number;
  /** What the offer takes off the net monthly price, in minor units. */
  readonly discountCents: number;
  /** Everything the subscription would then take off each month: a code's discount and this one. */
  readonly totalDiscountCents: number;
}

/**
 * The stay offer open to a member who gave `reason`, or null. It is open only to a member who is paying and staying: a
 * running subscription inside a paid period that nobody has already asked to end, which has not taken an offer before,
 * on a plan whose monthly price is the same as its first (a provider plan charges one amount every cycle, so a plan
 * that does not could not take the discount). A reason that is "I'm closing the business" is offered nothing. A
 * member who has paid to move up to Premium is offered nothing either: the discount would be worked against a plan the
 * provider is not yet billing, and the move's own price is the one they have just agreed.
 */
export function retentionOfferTerms(input: {
  readonly reason: AccountExitReason;
  readonly subscription: Subscription | null;
  readonly plan: Plan | null;
  readonly hasAccess: boolean;
  /** A move up to Premium has been paid for and has not renewed yet. */
  readonly upgradePaid?: boolean;
}): RetentionOfferTerms | null {
  const { subscription, plan } = input;
  if (subscription === null || plan === null || !input.hasAccess || input.upgradePaid === true) return null;
  if (subscription.status !== "active") return null;
  if (subscription.cancelRequestedAt !== null || subscription.retentionDiscountCents > 0) return null;
  if (plan.initialAmountCents !== plan.recurringAmountCents) return null;
  const percent = retentionOfferPercent(input.reason);
  if (percent === null) return null;
  const discountCents = retentionDiscountCentsFor({
    recurringAmountCents: plan.recurringAmountCents,
    currentDiscountCents: subscription.discountAmountCents,
    percent,
  });
  if (discountCents === null) return null;
  return { percent, discountCents, totalDiscountCents: subscription.discountAmountCents + discountCents };
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
