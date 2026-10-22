import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { appOriginForHostHeader } from "@/lib/server/request-brand";

/**
 * Razorpay POSTs the browser back here after the customer authorises the new mandate of a kept plan, or gives up. Like
 * /billing/pay/callback it is UX only and records nothing: the signed webhook is what confirms the mandate and lifts the
 * account closure. Both outcomes land on the restore-account page, which shows the dashboard's way in once the webhook has landed
 * and Keep my plan again if it has not (or the customer closed the window).
 */
export async function POST(request: Request): Promise<Response> {
  return Response.redirect(new URL(RESTORE_ACCOUNT_PATH, appOriginForHostHeader(request.headers.get("host"))), 303);
}
