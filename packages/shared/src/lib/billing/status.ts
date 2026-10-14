import { hasBillingAccess } from "@fynix/billing";
import type { BillingState, Plan, PlanTier, Subscription } from "@fynix/db";

/**
 * - `unpaid`: no payment has ever opened a subscription (none yet, a checkout that was never paid, or one that was
 *   replaced).
 * - `paid`: inside a paid period, whatever the subscription's status (one cancelled inside its period still counts).
 *   Everything that writes is open.
 * - `lapsed`: paid once, but the period has run out or the provider gave up. Restarting is reactivation, on Billing
 *   (docs/superpowers/specs/2026-10-09-reactivation-design.md), never a new first payment.
 */
export type CustomerBillingStatus = "unpaid" | "paid" | "lapsed";

export interface CustomerBilling {
  readonly status: CustomerBillingStatus;
  /** The access rule's answer. The only thing a write action should check. */
  readonly hasAccess: boolean;
  /** The newest subscription, whatever its status. */
  readonly subscription: Subscription | null;
  /** Which plan the business is on or is buying, Care or Premium: what its dashboard shows and its pages allow. */
  readonly tier: PlanTier;
  /**
   * The customer has paid to move up to Premium and the renewal at Premium's price has not been taken yet. Then `plan`
   * and `subscription` are the plan they are moving to, with the discount that carried over (see BillingState).
   */
  readonly upgradePaid: boolean;
  /** The plan to show prices from. Null only when the business's currency has no active plan of that tier. */
  readonly plan: Plan | null;
  /**
   * Money arrived that bought nothing (it paid a checkout we had replaced, say) and staff have not dealt with it.
   * An unpaid customer in this state must not be asked to pay again.
   */
  readonly paymentUnderReview: boolean;
  /**
   * Razorpay could not take the last renewal and is retrying, inside a period that was paid for: the date that period
   * ends, after which a payment that keeps failing takes the website offline. Null when no renewal is failing. Access is
   * unchanged until then, which is why nothing else in the app notices.
   */
  readonly renewalFailingUntil: Date | null;
}

export function summariseBilling(state: BillingState, now: Date): CustomerBilling {
  const { subscription, plan, tier, upgradePaid, hasEverPaid, paymentUnderReview } = state;
  const hasAccess = hasBillingAccess(subscription, now);
  const status: CustomerBillingStatus = hasAccess ? "paid" : hasEverPaid ? "lapsed" : "unpaid";
  const renewalFailingUntil = hasAccess && subscription?.status === "past_due" ? subscription.paidThroughAt : null;
  return { status, hasAccess, subscription, tier, upgradePaid, plan, paymentUnderReview, renewalFailingUntil };
}
