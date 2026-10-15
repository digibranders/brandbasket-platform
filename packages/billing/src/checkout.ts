import type { BillingProviderName, SubscriptionStatus } from "@fynix/db";
import { hasBillingAccess } from "./access";

/** An unpaid checkout younger than this is picked up again rather than replaced. */
export const CHECKOUT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The business's newest subscription, whatever its status. */
export interface LatestSubscription {
  readonly id: string;
  readonly planId: string;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly status: SubscriptionStatus;
  readonly paidThroughAt: Date | null;
  /** The referral code this checkout was opened with, or null when it was opened at the full price. */
  readonly referralCodeId: string | null;
  /** Which add-ons the checkout was opened with (bundleKey): empty when none. */
  readonly bundleKey: string;
  readonly createdAt: Date;
}

export interface CheckoutTarget {
  readonly planId: string;
  readonly provider: BillingProviderName;
  /** The referral code applied to the business now, or null. */
  readonly referralCodeId: string | null;
  /** The add-ons the customer is paying for now (bundleKey): empty when none. */
  readonly bundleKey: string;
}

/** A stable name for a choice of add-ons, so a checkout opened with a different choice is never reused. */
export function bundleKey(addOnIds: readonly string[]): string {
  return [...addOnIds].sort().join(",");
}

export interface CheckoutHistory {
  /** A payment was received that could not be applied, and staff have not resolved it yet. */
  readonly paymentUnderReview: boolean;
}

export type CheckoutDecision =
  /** Nothing live: open a new subscription. */
  | { readonly kind: "create" }
  /** A recent unpaid checkout for the same plan and provider: send the customer back to it. */
  | { readonly kind: "reuse"; readonly subscriptionId: string; readonly providerSubscriptionId: string }
  /**
   * The newest subscription must be ended and a new one opened in its place: an unpaid checkout that is stale or for
   * another plan, provider or referral code, or a live subscription that no longer grants access (a lapsed plan being
   * reactivated).
   */
  | { readonly kind: "replace"; readonly staleSubscriptionId: string }
  /** Already paid up: there is nothing to buy. */
  | { readonly kind: "already-paid" }
  /**
   * Money already arrived that could not be applied (it paid a checkout we had replaced). Staff sort that out;
   * taking a second payment meanwhile would only mean a second refund.
   */
  | { readonly kind: "payment-under-review" };

/**
 * What starting a checkout (or recording a manual payment) should do, given the business's newest subscription.
 * Access is decided first, so a subscription cancelled inside its paid period still counts as paid. A business that
 * has paid before and lapsed takes the same path as a first payment (docs/superpowers/specs/2026-10-09-reactivation-
 * design.md): its live but lapsed subscription is replaced, and a cancelled one is left beside the new one, which the
 * one-live-subscription index allows. Only an `incomplete` subscription can be reused.
 */
export function decideCheckout(
  latest: LatestSubscription | null,
  target: CheckoutTarget,
  now: Date,
  history: CheckoutHistory,
): CheckoutDecision {
  if (latest !== null && hasBillingAccess(latest, now)) return { kind: "already-paid" };
  if (history.paymentUnderReview) return { kind: "payment-under-review" };
  if (latest === null) return { kind: "create" };

  switch (latest.status) {
    case "incomplete": {
      const age = now.getTime() - latest.createdAt.getTime();
      // The referral code is part of what a checkout *is*: the provider's subscription was opened with (or
      // without) an offer attached, and its discount is frozen on our row. A customer who applies, changes or
      // removes a code after opening one must be sent to a fresh checkout, never back to the old amount. So is one who
      // changes which add-ons they are taking: the provider's plan charges the amount it was opened with.
      const reusable =
        latest.planId === target.planId &&
        latest.provider === target.provider &&
        latest.referralCodeId === target.referralCodeId &&
        latest.bundleKey === target.bundleKey &&
        age >= 0 &&
        age < CHECKOUT_REUSE_WINDOW_MS;
      return reusable
        ? { kind: "reuse", subscriptionId: latest.id, providerSubscriptionId: latest.providerSubscriptionId }
        : { kind: "replace", staleSubscriptionId: latest.id };
    }
    case "cancelled":
      // A replaced checkout, or a plan whose paid period ran out: nothing is live, so open a fresh one.
      return { kind: "create" };
    case "active":
    case "past_due":
    case "inactive":
      // Live but granting no access (access was checked first): a lapsed plan, or one marked active whose first charge
      // never came. It is ended and a new checkout opened in its place, as an unpaid stale checkout is.
      return { kind: "replace", staleSubscriptionId: latest.id };
    default: {
      const unhandled: never = latest.status;
      throw new Error(`Unhandled subscription status: ${String(unhandled)}`);
    }
  }
}
