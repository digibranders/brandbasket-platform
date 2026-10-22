import type { BundledAddOn, SubscriptionStatus } from "@brandbasket/db";

export interface BillingAccessInput {
  readonly status: SubscriptionStatus;
  readonly paidThroughAt: Date | null;
}

/**
 * The single rule behind the dashboard's action wall, and later website visibility.
 *
 * There is no grace period: the customer's decision is that access ends the moment the subscription is not paid for.
 *
 * | status                          | access                                   |
 * | ------------------------------- | ---------------------------------------- |
 * | no subscription                 | never                                    |
 * | `incomplete`                    | never (no money has arrived)             |
 * | `inactive`                      | never, whatever `paidThroughAt` says     |
 * | `active`, `past_due`, `cancelled` | only while `paidThroughAt` is after now |
 *
 * `inactive` means the provider has stopped retrying, so access ends now even if a paid-through date lingers.
 * `past_due` keeps access because the provider is still retrying inside a period that was paid for. `cancelled`
 * keeps access until the period the customer already paid for runs out. A null `paidThroughAt` never grants access.
 */
export function hasBillingAccess(subscription: BillingAccessInput | null, now: Date): boolean {
  if (subscription === null) return false;
  switch (subscription.status) {
    case "incomplete":
    case "inactive":
      return false;
    case "active":
    case "past_due":
    case "cancelled":
      return subscription.paidThroughAt !== null && subscription.paidThroughAt.getTime() > now.getTime();
    default: {
      const unhandled: never = subscription.status;
      throw new Error(`Unhandled subscription status: ${String(unhandled)}`);
    }
  }
}

/** The part of a subscription line the website rule reads. */
export type WebsiteLineInput = Pick<BundledAddOn, "addOn" | "status">;

/**
 * Whether the business has the Managed Website service: the website, its allowances and its onboarding follow this, not the
 * plan row. It needs billing access and a paid (`active`) `managed-website` line. A line the customer has dropped stays
 * `active` until the renewal completes the change, and billing access already ends at `paidThroughAt`, so a dropped website
 * runs to the end of the paid month and stops there, as a cancel does. A Social-only or SEO-only business has no such line.
 */
export function hasWebsiteService(
  lines: readonly WebsiteLineInput[],
  subscription: BillingAccessInput | null,
  now: Date,
): boolean {
  return hasBillingAccess(subscription, now) && lines.some((line) => line.addOn === "managed-website" && line.status === "active");
}
