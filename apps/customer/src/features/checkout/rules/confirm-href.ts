import { reactivationReturnHref } from "@brandbasket/shared/lib/billing/payment-step";
import type { PaymentConfirmation } from "../server/payment-confirmation";
import { membershipFailedHref, membershipReceivedHref, type MembershipTier } from "./membership";

/*
 * Ported from apps/platform lib/billing/confirm-href.ts and the shared afterPaymentHref, with the new app's addresses: the
 * website client's payment step is /checkout, its setup is /checklist (plan 61, section 3).
 */

/** Where an account lands the moment its payment has opened its plan: Home, with the welcome switched on (lib/celebration.ts). */
export const MEMBER_WELCOME_HREF = "/?welcome=1";

/** Where a confirmed payment lands: the Website once the setup is sent, otherwise the checklist to finish it. */
export function afterPaymentHref(projectStillOpen: boolean): string {
  return projectStillOpen ? "/checklist" : "/website";
}

/**
 * Where each confirmation outcome sends the customer. `membership` is the plan a sign-up account is buying, or null for a
 * website client invited by staff. Both pay on the checkout, so a payment that did not go through returns there.
 */
export function hrefAfter(result: PaymentConfirmation, membership: MembershipTier | null): string {
  const tier = membership ?? "managed";
  switch (result.kind) {
    case "invalid":
      return membershipFailedHref(tier);
    case "needs-attention":
      return membershipReceivedHref(tier);
    case "membership-opened":
      // A new plan lands on Home, which greets it with the welcome while the address carries the welcome parameter.
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
