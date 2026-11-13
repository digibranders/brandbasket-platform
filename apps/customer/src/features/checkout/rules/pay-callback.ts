import { reactivationReturnHref } from "@brandbasket/shared/lib/billing/payment-step";
import { membershipFailedHref, membershipReceivedHref, type MembershipTier } from "./membership";

/*
 * Ported from apps/platform lib/billing/pay-callback.ts. In the old app a website client invited by staff paid on Check and
 * send (/onboarding/review); here every first payment is taken on /checkout, so both kinds of unpaid account come back to it.
 */

/** The pay page marks its Razorpay callback address with this when the payment is a reactivation. */
export const RETURN_PARAM = "return";
export const RETURN_TO_BILLING = "billing";

export interface PayCallback {
  /** Razorpay reported a decline or a cancelled payment (or the post could not be read). */
  readonly failed: boolean;
  /** The plan a sign-up account was buying, or null for a website client's own first payment. */
  readonly membership: MembershipTier | null;
  /** The callback's `return` mark, as given: only RETURN_TO_BILLING means anything. */
  readonly returnTo: string | null;
}

/**
 * Where Razorpay's return lands, a page the signed-in customer could open anyway: Plan & billing for a reactivation, the
 * checkout for a first payment. Each says received or failed; none of them records anything. Anything but the known `return`
 * mark is ignored, so the callback can never be turned into an open redirect.
 */
export function payCallbackDestination({ failed, membership, returnTo }: PayCallback): string {
  if (returnTo === RETURN_TO_BILLING) return reactivationReturnHref(failed ? "failed" : "received");
  return failed ? membershipFailedHref(membership ?? "managed") : membershipReceivedHref(membership ?? "managed");
}
