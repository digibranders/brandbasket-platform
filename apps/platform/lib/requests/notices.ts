import { REOPEN_WINDOW_DAYS } from "@brandbasket/shared/lib/change-requests";
import { CHARGE_NOTICES, readChargeNotice } from "@/lib/billing/charge-notices";
import type { RequestNotice } from "./links";

export interface NoticeLine {
  /** False for a problem: it is announced as an alert. */
  readonly ok: boolean;
  readonly text: string;
}

const REQUEST_NOTICES: Readonly<Record<RequestNotice, string>> = {
  changed: "This request has changed since you opened it. Have a look at where it is now.",
  window: `The ${REOPEN_WINDOW_DAYS} days to reopen this are over. Write to us below and we will help.`,
  failed: "That did not work. Please try again.",
};

/** The word under `?notice=` for a move that was refused, or null for anything else. */
export function readRequestNotice(value: string | readonly string[] | undefined): RequestNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(REQUEST_NOTICES, value) ? (value as RequestNotice) : null;
}

/** What the page says after a move was refused. */
export function requestNoticeLine(notice: RequestNotice): NoticeLine {
  return { ok: false, text: REQUEST_NOTICES[notice] };
}

/**
 * What the page says when a payment for a quote comes back (`?charge=`). The two good outcomes say the change has started;
 * the rest use the Billing page's own words, which do not point at Billing.
 */
export function paymentNoticeLine(value: string | readonly string[] | undefined): NoticeLine | null {
  const notice = typeof value === "string" ? readChargeNotice(value) : null;
  if (notice === null) return null;
  if (notice === "paid") return { ok: true, text: "Payment received. We have started on your change." };
  if (notice === "processing") return { ok: true, text: "Thanks, we are confirming your payment with the bank. Your change starts within a minute or two." };
  return CHARGE_NOTICES[notice];
}
