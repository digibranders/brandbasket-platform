import type { SubscriptionStatus } from "@fynix/db";

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
