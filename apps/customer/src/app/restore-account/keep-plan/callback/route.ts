import { serverEnv } from "@/lib/env";

/**
 * Razorpay POSTs the browser back here after a closing account authorises the new mandate of a kept plan, or gives up (the old
 * app's address). UX only: the signed webhook in apps/platform confirms the mandate and lifts the closure, so this records
 * nothing and calls no guard. Both outcomes land on the restore-account page, which runs its own guard.
 */
export function POST(): Response {
  return Response.redirect(new URL("/restore-account", serverEnv().APP_ORIGIN), 303);
}
