import { afterPaymentHref, PAYMENT_RECEIVED_HREF, PAYMENT_STEP_HREF, reactivationReturnHref } from "@brandbasket/shared/lib/billing/payment-step";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import { membershipFailedHref, membershipReceivedHref, type MembershipTier } from "@/lib/membership";
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
      // A new plan lands on Overview, which greets it with the welcome popup while the address carries the welcome parameter.
      return MEMBER_WELCOME_HREF;
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
