import "server-only";
import {
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  isPackageOfferForfeited,
  type Database,
  type ScopedTransaction,
} from "@brandbasket/db";
import { reactivationBasketOf, type ReactivationBasket } from "../lib/billing/bundle";

/**
 * The basket a business that paid before and lapsed would get back, read from its newest subscription (reactivationBasketOf).
 * Read it before the lapsed subscription is replaced: replacing ends its lines. Staff connection, or the business's own scope.
 */
export async function loadReactivationBasket(db: Database | ScopedTransaction, businessId: string): Promise<ReactivationBasket> {
  const subscription = await findLatestSubscriptionForBusiness(db, businessId);
  const lines = subscription === null ? [] : await findBundledAddOnsForSubscription(db, subscription.id);
  return reactivationBasketOf({ subscription, lines, forfeited: await isPackageOfferForfeited(db, businessId) });
}
