import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { AddOnView } from "@brandbasket/shared/lib/billing/add-on-state";
import type { AddOnPaymentNotice } from "./add-on-notices";

/**
 * When the page is redrawn after a return from Razorpay, the webhook that records the payment can arrive a moment after
 * the customer does. The page asks the server for its state again this long after the return, twice, and then stops.
 */
export const RETURN_REFRESH_DELAYS_MS: readonly number[] = [3000, 8000];

/** The part of a page entry the return check reads. A broken or missing entry has no state to wait on. */
export type ReturnRefreshEntry =
  | { readonly kind: "ready"; readonly addOn: MonthlyAddOnId; readonly view: AddOnView }
  | { readonly kind: "broken"; readonly addOn: MonthlyAddOnId }
  | { readonly kind: "included"; readonly addOn: MonthlyAddOnId };

/** States an add-on is still in before the payment is recorded: not bought, going to end or pause, or waiting on a payment. */
const BEFORE_PAYMENT: ReadonlySet<AddOnView["state"]> = new Set(["none", "ended", "ending", "pausing", "paused", "failed"]);
/** States a Keep it leaves behind until its webhook moves the row to active. */
const BEFORE_KEEP: ReadonlySet<AddOnView["state"]> = new Set(["none", "ended", "ending", "pausing"]);

/**
 * Whether the page, shown right after a return from paying, is probably still missing what that payment changes.
 *
 * `kept` names its add-on, so only that add-on's row is checked. `received` names none (a monthly purchase, a Resume, a
 * Pay now all return the same way), so it waits while any add-on is still before its payment. Every other notice is
 * final and never waits.
 */
export function isAwaitingReturnWebhook(
  notice: AddOnPaymentNotice | null,
  keptAddOn: MonthlyAddOnId | null,
  entries: readonly ReturnRefreshEntry[],
): boolean {
  if (notice === "kept") {
    const entry = keptAddOn === null ? undefined : entries.find((candidate) => candidate.addOn === keptAddOn);
    return entry !== undefined && entry.kind === "ready" && BEFORE_KEEP.has(entry.view.state);
  }
  if (notice === "received") {
    return entries.some((entry) => entry.kind === "ready" && BEFORE_PAYMENT.has(entry.view.state));
  }
  return false;
}
