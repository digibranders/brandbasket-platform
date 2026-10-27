import { afterPaymentHref, PAYMENT_RECEIVED_HREF, PAYMENT_STEP_HREF, reactivationReturnHref } from "@brandbasket/shared/lib/billing/payment-step";
import { MEMBER_HOME, membershipFailedHref, membershipReceivedHref, type MembershipTier } from "@/lib/membership";
import type { PaymentConfirmation } from "@/lib/server/payment-confirmation";

const FAILED_HREF = `${PAYMENT_STEP_HREF}?payment=failed`;

/**
 * Where each confirmation outcome sends the customer. `membership` is the plan a free listing account is buying, or null:
 * such an account has no Check and send to go back to, so a payment that did not open its plan returns it to that
 * plan's page.
 */
export function hrefAfter(result: PaymentConfirmation, membership: MembershipTier | null): string {
  switch (result.kind) {
    case "invalid":
      return membership === null ? FAILED_HREF : membershipFailedHref(membership);
    case "needs-attention":
      return membership === null ? PAYMENT_RECEIVED_HREF : membershipReceivedHref(membership);
    case "membership-opened":
      // The Welcome overview is what an account sees until its kickoff call has happened, so a new plan lands on Overview with nothing added to the address.
      return MEMBER_HOME;
    case "reactivated":
      return reactivationReturnHref("received");
    case "paid":
    case "already-recorded":
      return afterPaymentHref(result.projectStillOpen);
    default: {
      const unhandled: never = result;
      throw new Error(`Unhandled payment confirmation: ${JSON.stringify(unhandled)}`);
    }
  }
}
