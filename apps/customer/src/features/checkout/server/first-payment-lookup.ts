import "server-only";
import type { Subscription } from "@brandbasket/db";
import { reportError } from "@/lib/report";
import { recordChargeFromRazorpay, recordUpfrontFromRazorpay } from "@/platform/lib/server/razorpay-webhook-handler";

/**
 * For a checkout whose first payment the browser says went through: asks Razorpay whether it holds that payment and, if it does,
 * records it through the webhook's own path. The webhook is the usual way, but it can be late or refused, and the customer should not
 * be offered Pay again, or sit on a waiting page, for a payment Razorpay already holds. A first-month offer checkout is asked for its
 * upfront payment, any other for the plan's own first charge. Never throws: a failed question leaves the page as it was.
 */
export async function recordFirstPaymentIfHeld(checkout: Pick<Subscription, "provider" | "providerSubscriptionId" | "firstPaymentCents">): Promise<boolean> {
  if (checkout.provider !== "razorpay") return false;
  try {
    return checkout.firstPaymentCents === null
      ? await recordChargeFromRazorpay(checkout.providerSubscriptionId)
      : await recordUpfrontFromRazorpay(checkout.providerSubscriptionId);
  } catch (error) {
    reportError(error, { area: "checkout.first-payment-lookup" });
    return false;
  }
}
