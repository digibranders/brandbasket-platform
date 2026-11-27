import "server-only";
import type { BillingProvider } from "@brandbasket/billing";
import { type Database, cancelStaleSubscription, findPaymentLinkById, findPendingCheckoutsForLink, lockBusinessForBilling, paymentLinkState, type PaymentLink } from "@brandbasket/db";
import { cancelAtProvider } from "./provider-cancellation";

/*
 * Plan 66, step 6: the unpaid checkout of a deal's payment 2. The customer opens it at the provider (Razorpay) after staff mark the
 * website ready, and it freezes that amount. When staff then undo "Website ready", edit the deal or cancel it, the checkout is no
 * longer the deal, and must not stay payable.
 */

/**
 * Ends every unpaid checkout opened for this deal link: first in our database (the same cancelStaleSubscription a replaced checkout
 * goes through, under the business's billing lock), then at the provider, which never throws (a failure is logged for staff). After this
 * a payment arriving on it lands on a cancelled subscription, which both payment recorders keep for staff as `checkout_replaced`. A
 * payment that already activated a subscription is not touched (the update only matches unpaid rows). Returns how many were ended.
 */
export async function cancelPendingDealCheckout(db: Database, provider: BillingProvider, input: { readonly businessId: string; readonly linkId: string; readonly now: Date }): Promise<number> {
  const ended = await db.transaction(async (tx) => {
    await lockBusinessForBilling(tx, input.businessId);
    const pending = await findPendingCheckoutsForLink(tx, input);
    for (const checkout of pending) await cancelStaleSubscription(tx, { subscriptionId: checkout.subscriptionId, businessId: input.businessId, now: input.now });
    return pending;
  });
  for (const checkout of ended) {
    await cancelAtProvider(provider, { businessId: input.businessId, subscriptionId: checkout.subscriptionId, provider: checkout.provider, providerSubscriptionId: checkout.providerSubscriptionId });
  }
  return ended.length;
}

/**
 * Whether a payment for a deal's checkout must be refused because the deal is no longer waiting for its balance (staff took "Website
 * ready" back, or cancelled it) while the subscription was still unpaid. A free deal and a link that this very subscription paid are
 * not stale: the second delivery of a recorded payment is the recorder's own duplicate check.
 */
export async function isDealCheckoutStale(db: Parameters<typeof findPaymentLinkById>[0], subscription: { readonly id: string; readonly paymentLinkId: string | null; readonly setupFeeAdvanceCents?: number | null }, now: Date): Promise<boolean> {
  if (subscription.paymentLinkId === null || (subscription.setupFeeAdvanceCents ?? null) === null) return false;
  const link: PaymentLink | null = await findPaymentLinkById(db, subscription.paymentLinkId);
  if (link === null) return false;
  if (link.subscriptionId === subscription.id) return false;
  return paymentLinkState(link, now) !== "balance_due";
}
