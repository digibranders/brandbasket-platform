import type { SubscriptionStatus } from "@firstfold/db";

/**
 * Razorpay's vocabulary, mapped to ours. `pending` means Razorpay is still retrying a failed charge inside a period
 * that was paid for, so the customer keeps access until it runs out; `halted` means it has given up, and access ends
 * immediately. There is no grace period beyond that.
 */
const RAZORPAY_STATUS: ReadonlyMap<string, SubscriptionStatus> = new Map([
  ["created", "incomplete"],
  ["authenticated", "active"],
  ["active", "active"],
  ["pending", "past_due"],
  ["halted", "inactive"],
  ["paused", "inactive"],
  ["cancelled", "cancelled"],
  ["completed", "cancelled"],
  ["expired", "cancelled"],
]);

/** Anything Razorpay adds later is treated as unpaid until it is mapped here on purpose. */
export function mapRazorpayStatus(providerStatus: string): SubscriptionStatus {
  return RAZORPAY_STATUS.get(providerStatus) ?? "incomplete";
}
