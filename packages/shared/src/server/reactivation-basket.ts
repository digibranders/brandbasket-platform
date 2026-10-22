import "server-only";
import {
  findBundledAddOnsForSubscription,
  findLatestActivatedSubscriptionForBusiness,
  findLatestSubscriptionForBusiness,
  isPackageOfferForfeited,
  type Database,
  type ScopedTransaction,
} from "@brandbasket/db";
import { reactivationBasketOf, type ReactivationBasket } from "../lib/billing/bundle";

/**
 * The basket a business that paid before and lapsed would get back (reactivationBasketOf): the services of the newest subscription
 * a payment activated, with the credit of the newest one, which may be a reactivation checkout left unpaid, and whether the customer cancelled themselves.
 * Read it before the lapsed subscription is replaced: replacing ends its lines. Staff connection, or the business's own scope.
 */
export async function loadReactivationBasket(db: Database | ScopedTransaction, businessId: string): Promise<ReactivationBasket> {
  const subscription = await findLatestSubscriptionForBusiness(db, businessId);
  const billed = subscription === null || subscription.activatedAt !== null ? subscription : await findLatestActivatedSubscriptionForBusiness(db, businessId);
  const lines = billed === null ? [] : await findBundledAddOnsForSubscription(db, billed.id);
  // An unpaid checkout opened after the customer cancelled has not been asked to end; the paid one it replaced was.
  const cancelRequestedAt = subscription?.cancelRequestedAt ?? billed?.cancelRequestedAt ?? null;
  return reactivationBasketOf({
    subscription: subscription === null ? null : { ...subscription, cancelRequestedAt },
    lines,
    forfeited: await isPackageOfferForfeited(db, businessId),
  });
}
