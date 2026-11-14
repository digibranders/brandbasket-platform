import "server-only";
import type { Subscription } from "@brandbasket/db";
import { reportError } from "@/lib/report";
import { recordUpfrontFromRazorpay } from "@/platform/lib/server/razorpay-webhook-handler";

/**
 * For a checkout whose first payment the browser says went through: asks Razorpay whether it holds that payment and, if it does,
 * records it through the webhook's own path. The webhook is the usual way, but it can be late or refused, and the customer should not
 * sit on a waiting page for it. Only a first-month offer checkout can be asked about (its upfront payment is findable by subscription).
 * Never throws: a failed question leaves the page waiting, as before.
 */
export async function recordFirstPaymentIfHeld(checkout: Pick<Subscription, "provider" | "providerSubscriptionId" | "firstPaymentCents">): Promise<boolean> {
  if (checkout.provider !== "razorpay" || checkout.firstPaymentCents === null) return false;
  try {
    return await recordUpfrontFromRazorpay(checkout.providerSubscriptionId);
  } catch (error) {
    reportError(error, { area: "checkout.first-payment-lookup" });
    return false;
  }
}
