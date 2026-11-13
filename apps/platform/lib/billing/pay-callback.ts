import { PAYMENT_RECEIVED_HREF, PAYMENT_STEP_HREF, reactivationReturnHref } from "@brandbasket/shared/lib/billing/payment-step";
import { membershipFailedHref, membershipReceivedHref, type MembershipTier } from "@/lib/membership";

/** The pay page marks its Razorpay callback address with this when the payment is a reactivation. */
export const RETURN_PARAM = "return";
export const RETURN_TO_BILLING = "billing";
/** The mark for a combined subscription approved for an added service (plan 63): it returns to Your services. */
export const RETURN_TO_SERVICES = "services";

/** Same query param the test checkout uses for a declined payment, which Check and send already explains. */
const PAYMENT_FAILED_HREF = `${PAYMENT_STEP_HREF}?payment=failed`;

export interface PayCallback {
  /** Razorpay reported a decline or a cancelled payment (or the post could not be read). */
  readonly failed: boolean;
  /** The plan a free listing account was buying, or null. */
  readonly membership: MembershipTier | null;
  /** The callback's `return` mark, as given: only RETURN_TO_BILLING and RETURN_TO_SERVICES mean anything. */
  readonly returnTo: string | null;
}

/**
 * Where Razorpay's return lands, a page the signed-in customer could open anyway: Billing for a reactivation, Your services
 * for an added service (which shows it once the webhook records it, or says the payment failed), the plan's page for a free
 * listing account, and Check and send for a website client's first payment. None of them records anything.
 */
export function payCallbackDestination({ failed, membership, returnTo }: PayCallback): string {
  if (returnTo === RETURN_TO_BILLING) return reactivationReturnHref(failed ? "failed" : "received");
  if (returnTo === RETURN_TO_SERVICES) return failed ? "/services?charge=failed" : "/services?charge=processing";
  if (membership !== null) return failed ? membershipFailedHref(membership) : membershipReceivedHref(membership);
  return failed ? PAYMENT_FAILED_HREF : PAYMENT_RECEIVED_HREF;
}
