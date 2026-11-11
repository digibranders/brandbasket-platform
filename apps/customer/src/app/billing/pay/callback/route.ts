import { razorpayReportedFailure } from "@/features/checkout/rules/callback";
import { MEMBERSHIP_CALLBACK_PARAM, readMembershipCallbackTier } from "@/features/checkout/rules/membership";
import { payCallbackDestination, RETURN_PARAM } from "@/features/checkout/rules/pay-callback";
import { serverEnv } from "@/lib/env";

/**
 * Razorpay POSTs the browser back here after a plan payment, successful or not (the old app's address, kept so open checkouts
 * keep working). UX only: it reads no session and no data, writes nothing and never reads the signature, so it calls no guard
 * (Razorpay's cross-site POST carries no session cookie anyway). It only picks which page to show, and every such page runs its
 * own guard. The marks pick only between those pages, so it is no open redirect (payCallbackDestination).
 */
export async function POST(request: Request): Promise<Response> {
  const failed = await razorpayReportedFailure(request);
  const params = new URL(request.url).searchParams;
  const destination = payCallbackDestination({
    failed,
    membership: readMembershipCallbackTier(params.get(MEMBERSHIP_CALLBACK_PARAM)),
    returnTo: params.get(RETURN_PARAM),
  });
  return Response.redirect(new URL(destination, serverEnv().APP_ORIGIN), 303);
}
