/** What a return address says about the payment the customer just made: codes, never messages. */
export type PaymentReturn = "received" | "failed";

/** The return a `?payment=` value names, or null for anything else. */
export function readPaymentReturn(value: string | string[] | undefined): PaymentReturn | null {
  return value === "received" || value === "failed" ? value : null;
}

/** What the page draws about the payment: nothing, a wait, a confirmation or a failure. */
export type PaymentReturnView = "none" | "confirming" | "confirmed" | "failed";

export interface PaymentReturnInput {
  readonly returned: PaymentReturn | null;
  /** The access rule's answer right now: the payment has been recorded and the plan is open. */
  readonly hasAccess: boolean;
  /** A received payment is waiting for staff; the page has its own words for that. */
  readonly paymentUnderReview: boolean;
}

/**
 * Razorpay's webhook, not the browser's return, is what records a payment, so a page can be drawn before it has
 * arrived. This is the one place that decides what such a page says, so every page agrees: it waits (`confirming`)
 * until the plan has access, then says so (`confirmed`). A failure shows only while there is no access, because a
 * payment that completed after the window was closed still opens the plan.
 */
export function paymentReturnView({ returned, hasAccess, paymentUnderReview }: PaymentReturnInput): PaymentReturnView {
  if (returned === null || paymentUnderReview) return "none";
  if (returned === "received") return hasAccess ? "confirmed" : "confirming";
  return hasAccess ? "none" : "failed";
}
