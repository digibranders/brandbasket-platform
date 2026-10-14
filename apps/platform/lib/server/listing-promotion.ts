import "server-only";
import {
  findOwnListing,
  openListingPromotionCharge,
  withTenantScope,
  type DirectoryPaidTag,
  type PromotionPurchaseRefusal,
} from "@firstfold/db";
import {
  PROMOTION_TAX_BASIS_POINTS,
  PROMOTION_WEEK_CHARGED_PAISE,
  PROMOTION_WEEK_NET_PAISE,
  promotionChargeDescription,
} from "@firstfold/shared/lib/directory/promotion";
import { startCustomerChargePayment, type ChargePaymentStart } from "./charges";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/** Where paying for a week of a listing tag goes next. */
export type ListingPromotionStart =
  | ChargePaymentStart
  /** The business has no listing yet, so there is nothing to tag. */
  | { readonly kind: "no-listing" }
  /** A week of this tag cannot be bought now (another tag is running, or the next week is already booked). */
  | { readonly kind: "refused"; readonly reason: PromotionPurchaseRefusal };

/**
 * Opens a payment for one week of `tag` on the signed-in customer's listing: the open `listing_promotion` charge
 * (added, or pointed at this tag), then the same one-off payment every charge uses. Nothing starts here: the week
 * starts only when the payment is confirmed (the signed Razorpay webhook, or the test checkout while payments are
 * simulated), in recordChargePayment. The caller has checked the customer's plan is paid.
 *
 * The price is fixed here, never taken from the request: ₹299 with 18% GST through the one tax helper.
 */
export async function startListingPromotionPayment(
  customer: GrantedCustomer,
  tag: DirectoryPaidTag,
  now: Date,
): Promise<ListingPromotionStart> {
  const { tenant } = customer;
  const listing = await withTenantScope(getAppDb(), tenant, (tx) => findOwnListing(tx));
  if (listing === null) return { kind: "no-listing" };

  const opened = await openListingPromotionCharge(getStaffDb(), {
    businessId: tenant.businessId,
    tag,
    description: promotionChargeDescription(tag),
    unitAmountCents: PROMOTION_WEEK_NET_PAISE,
    taxRateBasisPoints: PROMOTION_TAX_BASIS_POINTS,
    amountCents: PROMOTION_WEEK_CHARGED_PAISE,
    now,
  });
  if (opened.kind === "refused") return opened;
  return startCustomerChargePayment(customer, opened.chargeId);
}
