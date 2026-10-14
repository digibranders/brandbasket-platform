import { isSignedSubscriptionPayment } from "@/lib/billing/add-on-pay-callback";
import { ADD_ON_KEPT_CALLBACK_PARAM, addOnCallbackHref, readKeptAddOn } from "@/lib/billing/add-on-notices";
import { razorpayKeySecret } from "@/lib/server/billing";
import { appOriginForHostHeader } from "@/lib/server/request-brand";

/**
 * Where Razorpay Checkout sends the browser back after a monthly add-on payment, successful or not. Like
 * /billing/pay/callback it is UX only and writes nothing: the signed webhook records the payment and starts the add-on.
 * It differs in one way. The Add-ons page says "Payment received" on this return, so "received" is only said when the
 * return carries a payment signed with our key secret (isSignedSubscriptionPayment); a decline, a missing field, a wrong
 * signature or a body that cannot be read all say "failed" rather than claim a payment that may not exist.
 */
export async function POST(request: Request): Promise<Response> {
  const signed = await readSignedPayment(request);
  const kept = readKeptAddOn(new URL(request.url).searchParams.get(ADD_ON_KEPT_CALLBACK_PARAM));
  const destination = addOnCallbackHref(signed, kept);
  return Response.redirect(new URL(destination, appOriginForHostHeader(request.headers.get("host"))), 303);
}

async function readSignedPayment(request: Request): Promise<boolean> {
  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return false;
  }
  // Outside the try: a missing key secret is a broken deployment and must be seen, not turned into a failed payment.
  return isSignedSubscriptionPayment(body, razorpayKeySecret());
}
