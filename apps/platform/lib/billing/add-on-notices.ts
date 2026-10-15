import { ADD_ONS_PATH, isMonthlyAddOnId, type MonthlyAddOnId } from "@fynix/shared/lib/billing/add-ons";
import type { AddOnConfirmation } from "@/lib/server/add-ons";

/** What the Add-ons page says after a customer tried to pay for an add-on, keyed by `?payment=` in its address. */
export const ADD_ON_PAYMENT_NOTICES = {
  received: { ok: true, text: "Payment received. Our team will contact you soon." },
  failed: { ok: false, text: "That payment didn't go through. Nothing was charged." },
  review: { ok: false, text: "We received your payment but couldn't apply it. Our team will be in touch." },
  recorded: { ok: true, text: "That payment was already recorded, so nothing more was taken." },
  /**
   * Keep it. Razorpay charges nothing today for it (it only authorises a subscription that starts on the old billing
   * date), so it must never say a payment was received. The page replaces this text with keptNoticeText when it can
   * name the add-on and the date; this is what it says when it cannot.
   */
  kept: { ok: true, text: "Done. Your add-on carries on." },
  /** A press release payment the bank has not yet confirmed. Nothing is recorded until Razorpay says so. */
  confirming: { ok: true, text: "We're confirming your payment. It shows here once Razorpay confirms it." },
  /** A press release return whose charge is already settled or cleared, so there is nothing left to pay. */
  "nothing-due": { ok: true, text: "This press release has no payment waiting." },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type AddOnPaymentNotice = keyof typeof ADD_ON_PAYMENT_NOTICES;

/** The notice a `?payment=` value names, or null for anything else. */
export function readAddOnPaymentNotice(value: string | string[] | undefined): AddOnPaymentNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(ADD_ON_PAYMENT_NOTICES, value) ? (value as AddOnPaymentNotice) : null;
}

/** The add-on a value names, if it is one of the monthly ones. Used for `?addOn=` and the Keep it callback mark. */
export function readKeptAddOn(value: string | string[] | null | undefined): MonthlyAddOnId | null {
  if (typeof value !== "string") return null;
  return isMonthlyAddOnId(value) ? value : null;
}

/** "Done. Social media carries on after 12 November 2026." The date is the old billing date, already formatted. */
export function keptNoticeText(title: string, date: string): string {
  return `Done. ${title} carries on after ${date}.`;
}

/** The pay page puts this on the callback address of a Keep it checkout, with the add-on as its value. */
export const ADD_ON_KEPT_CALLBACK_PARAM = "kept";

/** The Add-ons page, showing `notice`. A kept notice also names the add-on, so the page can say which one. */
export function addOnPaymentHref(notice: AddOnPaymentNotice, addOn?: MonthlyAddOnId): string {
  const base = `${ADD_ONS_PATH}?payment=${notice}`;
  return addOn === undefined ? base : `${base}&addOn=${addOn}`;
}

/**
 * Where Razorpay's return to the add-on callback goes. `kept` is the add-on from the callback address mark, set only
 * for a Keep it checkout. A signed return from one is "kept", never "received": nothing was charged. Anything unsigned
 * is "failed" whatever the mark says.
 */
export function addOnCallbackHref(signed: boolean, kept: MonthlyAddOnId | null): string {
  if (!signed) return addOnPaymentHref("failed");
  return kept === null ? addOnPaymentHref("received") : addOnPaymentHref("kept", kept);
}

/**
 * What the Add-ons page says for each way confirming the fake provider's test checkout can come out. "authorised" only
 * ever follows a Keep it (nothing else is authorised without a payment), so it reads as kept, not as a payment.
 */
export function addOnConfirmationHref(kind: AddOnConfirmation["kind"], addOn: MonthlyAddOnId): string {
  switch (kind) {
    case "paid":
      return addOnPaymentHref("received");
    case "authorised":
      return addOnPaymentHref("kept", addOn);
    case "already-recorded":
      return addOnPaymentHref("recorded");
    case "needs-attention":
      return addOnPaymentHref("review");
    case "invalid":
      return addOnPaymentHref("failed");
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled add-on confirmation ${String(unhandled)}`);
    }
  }
}
