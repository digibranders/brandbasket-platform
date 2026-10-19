import { hasBillingAccess } from "@brandbasket/billing";
import type { ClientBilling, ClientManualPayment, ClientSummary } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";

/** How the staff console describes a business's money. */
export type ClientPaymentState =
  | {
      readonly kind: "paid" | "lapsed";
      /** The first payment, formatted, e.g. "$75". */
      readonly firstAmount: string;
      readonly firstPaidAt: Date | null;
      readonly paidThroughAt: Date | null;
      /** Set when the first payment was recorded by hand rather than through the provider: who, what, when. */
      readonly manual: ClientManualPayment | null;
    }
  /** Sent to checkout, not paid. */
  | { readonly kind: "checkout-open" }
  | { readonly kind: "not-paid" };

/**
 * `billing.subscription` is the newest subscription, cancelled or not, so a subscription cancelled inside its paid
 * period still reads as paid, and one cancelled after it as lapsed.
 */
export function clientPaymentState(billing: ClientBilling, now: Date): ClientPaymentState {
  const { subscription, firstPayment } = billing;
  if (firstPayment === null) {
    return subscription?.status === "incomplete" ? { kind: "checkout-open" } : { kind: "not-paid" };
  }
  const paid = subscription !== null && hasBillingAccess(subscription, now);
  return {
    kind: paid ? "paid" : "lapsed",
    firstAmount: formatMoney(firstPayment.amountCents, firstPayment.currency),
    firstPaidAt: firstPayment.paidAt,
    paidThroughAt: subscription?.activatedAt ? subscription.paidThroughAt : null,
    manual: firstPayment.manual,
  };
}

/** Businesses inside a paid period right now, cancelled subscriptions included: the "Paying customers" count. */
export function countPayingClients(clients: readonly Pick<ClientSummary, "billing">[], now: Date): number {
  return clients.filter((client) => hasBillingAccess(client.billing.subscription, now)).length;
}
