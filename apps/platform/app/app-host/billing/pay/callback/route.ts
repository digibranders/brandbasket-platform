import { payCallbackDestination, RETURN_PARAM } from "@/lib/billing/pay-callback";
import { MEMBERSHIP_CALLBACK_PARAM, readMembershipCallbackTier } from "@/lib/membership";
import { appOriginForHostHeader } from "@/lib/server/request-brand";

/**
 * Razorpay POSTs the browser back here on both a successful and a failed checkout attempt (see
 * https://razorpay.com/docs/payments/payment-gateway/callback-url/): success carries `razorpay_payment_id` /
 * `razorpay_subscription_id` / `razorpay_signature`, a decline or cancellation instead carries an `error` object
 * (form-encoded as `error[code]`, `error[description]`, `error[field]`, and possibly other `error[...]` fields
 * Razorpay adds beyond those three). This is UX only, never a source of truth — see razorpay-provider.ts's docblock
 * for why a cross-site POST cannot be trusted with activation — so it only distinguishes those two outcomes to pick
 * a screen; it never reads the signature fields and writes nothing to the database either way. A body it cannot
 * parse as form data is treated the same as a failure: claiming a payment was received when we cannot even read
 * the POST would be the worse mistake.
 *
 * A free listing account buying the Care plan or the Premium membership has no Check and send: the pay page marks its
 * callback address with the plan, and the browser goes back to that plan's page instead. A reactivation is marked to go
 * back to Billing. The marks only pick between pages the signed-in customer could open anyway, each of which checks for
 * itself who is looking (payCallbackDestination).
 */
export async function POST(request: Request): Promise<Response> {
  const failed = await hasRazorpayError(request);
  const params = new URL(request.url).searchParams;
  const destination = payCallbackDestination({
    failed,
    membership: readMembershipCallbackTier(params.get(MEMBERSHIP_CALLBACK_PARAM)),
    returnTo: params.get(RETURN_PARAM),
  });
  return Response.redirect(new URL(destination, appOriginForHostHeader(request.headers.get("host"))), 303);
}

async function hasRazorpayError(request: Request): Promise<boolean> {
  try {
    const body = await request.formData();
    return Array.from(body.keys()).some((key) => key === "error" || key.startsWith("error["));
  } catch {
    return true;
  }
}
