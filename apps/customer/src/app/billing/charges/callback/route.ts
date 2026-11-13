import { razorpayReportedFailure } from "@/features/checkout/rules/callback";
import { AD_RETURN_PARAM, CHANGE_TICKET_PARAM, changeTicketOfReturn, chargeKindOfReturn, chargeReturnHref } from "@/features/checkout/rules/charge-notices";
import { serverEnv } from "@/lib/env";

/**
 * Where Razorpay sends the browser back after a charge payment (the old app's address). UX only, like /billing/pay/callback: the
 * signed `order.paid` webhook records the payment, so this reads nothing, writes nothing and calls no guard; it only picks the
 * message and the page, each of which runs its own guard.
 */
export async function POST(request: Request): Promise<Response> {
  const failed = await razorpayReportedFailure(request);
  const params = new URL(request.url).searchParams;
  const kind = chargeKindOfReturn(params.get(AD_RETURN_PARAM));
  // A change quote's pay page also names the request's ticket (old links have none).
  const href = chargeReturnHref(kind, failed ? "failed" : "processing", changeTicketOfReturn(params.get(CHANGE_TICKET_PARAM)));
  return Response.redirect(new URL(href, serverEnv().APP_ORIGIN), 303);
}
