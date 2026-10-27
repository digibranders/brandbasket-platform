import type { Subscription } from "@brandbasket/db";

type Payable = Pick<Subscription, "status" | "provider" | "cancelRequestedAt">;

/** Cancelled at the provider, or asked to end with the paid period: either way the plan ends on its date and nothing more is taken. */
export function subscriptionEnding(subscription: Pick<Payable, "status" | "cancelRequestedAt">): boolean {
  return subscription.status === "cancelled" || subscription.cancelRequestedAt !== null;
}

/** Whether another payment is due: not for an ending plan, and not for one the team arranges payment for by hand. */
export function paymentsContinue(subscription: Payable): boolean {
  return !subscriptionEnding(subscription) && subscription.provider !== "manual";
}
