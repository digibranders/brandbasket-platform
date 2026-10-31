import type { ClientBilling } from "@brandbasket/db";
import type { ClientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";

/**
 * Whether the client's money needs a person before more build work: the paid period has run out (lapsed), or the
 * provider is still retrying a renewal that failed (past_due, the payment is overdue). Display only; it never moves a stage.
 */
export function billingNeedsAttention(
  payment: Pick<ClientPaymentState, "kind">,
  billing: Pick<ClientBilling, "subscription">,
): boolean {
  return payment.kind === "lapsed" || billing.subscription?.status === "past_due";
}
