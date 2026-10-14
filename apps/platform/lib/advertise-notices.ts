import type { BidOutcome } from "@firstfold/db";
import { AD_MAX_RUPEES, AD_MIN_RUPEES, AD_TAGLINE_MAX_LENGTH } from "@firstfold/shared/lib/directory/ads";

/*
 * What the Advertise page says after a form post: each action redirects to `/advertise?notice=<code>`, and the page
 * reads the code back. Codes, not messages, so nothing a visitor types into the URL is ever shown.
 */

export const ADVERTISE_NOTICES = {
  saved: { ok: true, text: "Your bid is in. Come back for the result when bidding closes." },
  withdrawn: { ok: true, text: "Bid withdrawn." },
  "tagline-saved": { ok: true, text: "Saved. We'll check your line and switch it on, usually within a working day." },
  "tagline-cleared": { ok: true, text: "Line removed. Your ad shows the usual line for your category." },
  "tagline-invalid": { ok: false, text: `Keep your line to ${AD_TAGLINE_MAX_LENGTH} characters.` },
  invalid: { ok: false, text: `Enter a whole number of rupees, from ₹${AD_MIN_RUPEES} to ₹${AD_MAX_RUPEES.toLocaleString("en-IN")}.` },
  "below-price": { ok: false, text: "That's below the starting price. Bid at least the price shown." },
  "above-max": { ok: false, text: `The highest bid is ₹${AD_MAX_RUPEES.toLocaleString("en-IN")} a week.` },
  "not-whole-rupees": { ok: false, text: "Bid in whole rupees." },
  closed: { ok: false, text: "Bidding for that week has closed." },
  "too-late-to-lower": { ok: false, text: "In the last day before bidding closes, a bid can only go up." },
  "claim-not-approved": { ok: false, text: "You can bid once we've confirmed the business is yours." },
  "no-claim": { ok: false, text: "This account has no business to advertise." },
  "no-page": { ok: false, text: "Ads aren’t open for newly added businesses yet." },
  "not-open": { ok: false, text: "Ads aren't open for your category yet." },
  "no-bid": { ok: false, text: "There's no bid to withdraw." },
  "spot-taken": { ok: false, text: "That spot is already booked for the week, so it isn't taking bids." },
  "picture-removed": { ok: true, text: "Ad picture removed. It stops showing within a minute." },
  "picture-invalid": { ok: false, text: "That didn't work. Reload the page and try again." },
  paid: { ok: true, text: "Payment received. Your ad is on." },
  processing: { ok: true, text: "Thanks, we're confirming your payment with the bank. Your ad goes up within a minute or two." },
  "pay-failed": { ok: false, text: "That payment didn't go through, and nothing was taken. You can try again." },
  "pay-problem": { ok: false, text: "We couldn't match that payment to your spot. Our team will be in touch." },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type AdvertiseNotice = keyof typeof ADVERTISE_NOTICES;

export function readAdvertiseNotice(value: string | string[] | undefined): AdvertiseNotice | null {
  return typeof value === "string" && Object.hasOwn(ADVERTISE_NOTICES, value) ? (value as AdvertiseNotice) : null;
}

/** The notice for a bid's outcome. */
export function bidNotice(outcome: BidOutcome): AdvertiseNotice {
  return outcome.kind === "refused" ? outcome.reason : outcome.kind;
}
