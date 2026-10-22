import "server-only";
import {
  findBundledAddOnsForSubscription,
  findLatestActivatedSubscriptionForBusiness,
  findLatestSubscriptionForBusiness,
  findReferralCodeById,
  isPackageOfferForfeited,
  type Database,
  type ReferralCode,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { reactivationBasketOf, type ReactivationBasket } from "../lib/billing/bundle";

/** The newest subscription and the one a payment last activated: the same one unless the newest is a checkout left unpaid. */
async function lastSubscriptions(db: Database | ScopedTransaction, businessId: string): Promise<{ readonly newest: Subscription | null; readonly billed: Subscription | null }> {
  const newest = await findLatestSubscriptionForBusiness(db, businessId);
  const billed = newest === null || newest.activatedAt !== null ? newest : await findLatestActivatedSubscriptionForBusiness(db, businessId);
  return { newest, billed };
}

/**
 * The basket a business that paid before and lapsed would get back (reactivationBasketOf): the services of the newest subscription
 * a payment activated, with the credit of the newest one, which may be a reactivation checkout left unpaid, and whether the customer cancelled themselves.
 * Read it before the lapsed subscription is replaced: replacing ends its lines. Staff connection, or the business's own scope.
 */
export async function loadReactivationBasket(db: Database | ScopedTransaction, businessId: string): Promise<ReactivationBasket> {
  const { newest, billed } = await lastSubscriptions(db, businessId);
  const lines = billed === null ? [] : await findBundledAddOnsForSubscription(db, billed.id);
  // An unpaid checkout opened after the customer cancelled has not been asked to end; the paid one it replaced was.
  const cancelRequestedAt = newest?.cancelRequestedAt ?? billed?.cancelRequestedAt ?? null;
  return reactivationBasketOf({
    subscription: newest === null ? null : { ...newest, cancelRequestedAt },
    lines,
    forfeited: await isPackageOfferForfeited(db, businessId),
  });
}

/** The code a lapse keeps, with the paid months its discount has left (null for no limit). */
export interface CarriedCode {
  readonly code: ReferralCode;
  readonly monthsLeft: number | null;
}

/**
 * The code a lapsed business keeps when it reactivates (docs/plans/18-platform-owner-decisions.md, decision 4): the code of the
 * subscription it last paid on, as long as the lapse was not the customer's own cancel (`basket.cancelled`: after that nothing
 * carries) and the code has paid months left. The code is the client's already, so it need not still be redeemable: one retired or
 * expired since still carries, and it does not use the redemption cap again (a redemption counts a business once). The caller
 * prices the discount on the reactivation basket. Staff connection, or the business's own scope; read it before the lapsed
 * subscription is replaced.
 */
export async function loadCarriedCode(db: Database | ScopedTransaction, businessId: string, basket: ReactivationBasket): Promise<CarriedCode | null> {
  if (basket.cancelled) return null;
  const { billed } = await lastSubscriptions(db, businessId);
  if (billed === null || billed.referralCodeId === null || billed.discountMonthsLeft === 0) return null;
  const code = await findReferralCodeById(db, billed.referralCodeId);
  return code === null ? null : { code, monthsLeft: billed.discountMonthsLeft };
}
