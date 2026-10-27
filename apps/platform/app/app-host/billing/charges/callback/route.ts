import { AD_RETURN_PARAM, CHANGE_TICKET_PARAM, changeTicketOfReturn, chargeKindOfReturn, chargeReturnHref } from "@/lib/billing/charge-notices";
import { appOriginForHostHeader } from "@/lib/server/request-brand";

/**
 * Where Razorpay Checkout sends the browser back after a charge payment, successful or not. UX only, exactly like
 * /billing/pay/callback: the signed `order.paid` webhook is what records the payment, so this only picks which
 * message to show, and on which page, and writes nothing. A body that cannot be read counts as a failure rather than claiming success.
 */
export async function POST(request: Request): Promise<Response> {
  const failed = await hasRazorpayError(request);
  // The pay page marks a won ad spot's or a move up's return address; anything else returns to Billing.
  const params = new URL(request.url).searchParams;
  const kind = chargeKindOfReturn(params.get(AD_RETURN_PARAM));
  // A change quote's pay page also names the request's ticket, so the page opens the request that was paid (old links have none).
  const href = chargeReturnHref(kind, failed ? "failed" : "processing", changeTicketOfReturn(params.get(CHANGE_TICKET_PARAM)));
  return Response.redirect(new URL(href, appOriginForHostHeader(request.headers.get("host"))), 303);
}

async function hasRazorpayError(request: Request): Promise<boolean> {
  try {
    const body = await request.formData();
    return Array.from(body.keys()).some((key) => key === "error" || key.startsWith("error["));
  } catch {
    return true;
  }
}
