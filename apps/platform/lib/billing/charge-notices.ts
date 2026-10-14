import { addOnPaymentHref, type AddOnPaymentNotice } from "./add-on-notices";

/** What the Billing page says after a customer tried to pay a charge, keyed by `?charge=` in its address. */
export const CHARGE_NOTICES = {
  paid: { ok: true, text: "Payment received. Download its invoice or receipt from Monthly billing below." },
  processing: {
    ok: true,
    text: "Thanks, we’re confirming your payment with the bank. It moves to your monthly billing within a minute or two.",
  },
  duplicate: {
    ok: false,
    text: "That charge had already been settled, so we’ve kept your payment aside and our team will refund it.",
  },
  review: { ok: false, text: "We received a payment that didn’t match the charge. Our team will be in touch." },
  failed: { ok: false, text: "That payment didn’t go through, and nothing was taken. You can try again." },
  "not-open": { ok: false, text: "That charge has already been paid or cleared, so there’s nothing to pay." },
  stale: {
    ok: false,
    text: "Your month renewed before that payment arrived, so the upgrade wasn’t applied and we’ve kept your payment aside to refund. You can start the upgrade again.",
  },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type ChargeNotice = keyof typeof CHARGE_NOTICES;

/** The notice a `?charge=` value names, or null for anything else. */
export function readChargeNotice(value: string | string[] | undefined): ChargeNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(CHARGE_NOTICES, value) ? (value as ChargeNotice) : null;
}

/** The Billing page, showing `notice`. */
export function chargeNoticeHref(notice: ChargeNotice): string {
  return `/billing?charge=${notice}`;
}

/** What the Advertise page's `?notice=` says for each outcome of paying for a won ad spot. */
const AD_NOTICE: Readonly<Record<ChargeNotice, string>> = {
  paid: "paid",
  processing: "processing",
  failed: "pay-failed",
  duplicate: "pay-problem",
  review: "pay-problem",
  "not-open": "pay-problem",
  stale: "pay-problem",
};

/** What the Upgrade page's `?payment=` says for each outcome of paying for a move up to Premium. */
const UPGRADE_NOTICE: Readonly<Record<ChargeNotice, string>> = {
  paid: "paid",
  processing: "processing",
  failed: "failed",
  duplicate: "problem",
  review: "problem",
  "not-open": "problem",
  stale: "stale",
};

/** What the Add-ons page's `?payment=` says for each outcome of paying for a press release. */
const PRESS_RELEASE_NOTICE: Readonly<Record<ChargeNotice, AddOnPaymentNotice>> = {
  paid: "received",
  processing: "confirming",
  failed: "failed",
  duplicate: "review",
  review: "review",
  "not-open": "nothing-due",
  stale: "review",
};

/**
 * Where paying a charge returns to: Billing, or for a won ad spot (`directory_ad`) the Advertise page, where the
 * owner sees the ad go up rather than a list of receipts, or for a press release the Add-ons page.
 */
export function chargeReturnHref(kind: string, notice: ChargeNotice): string {
  if (kind === "directory_ad") return `/advertise?notice=${AD_NOTICE[notice]}`;
  // A move up to Premium returns to the Upgrade page, which shows the client their Premium dashboard coming up.
  if (kind === "plan_upgrade") return `/upgrade?payment=${UPGRADE_NOTICE[notice]}`;
  if (kind === "press_release") return addOnPaymentHref(PRESS_RELEASE_NOTICE[notice]);
  return chargeNoticeHref(notice);
}

/**
 * Added to the payment provider's return address for a won ad spot, a move up to Premium or a press release, so the
 * return lands on Advertise, Upgrade or Add-ons rather than Billing.
 */
export const AD_RETURN_PARAM = "for";
export const AD_RETURN_VALUE = "ad";
export const UPGRADE_RETURN_VALUE = "upgrade";
export const PRESS_RELEASE_RETURN_VALUE = "press-release";

/** The kind of charge a provider return address names, for chargeReturnHref. Anything else is an ordinary charge. */
export function chargeKindOfReturn(value: string | null): string {
  if (value === AD_RETURN_VALUE) return "directory_ad";
  if (value === UPGRADE_RETURN_VALUE) return "plan_upgrade";
  if (value === PRESS_RELEASE_RETURN_VALUE) return "press_release";
  return "charge";
}

/** The Razorpay page that opens Checkout on a charge's stored order. */
export function chargePayPath(chargeId: string): string {
  return `/billing/charges/${chargeId}/pay`;
}
