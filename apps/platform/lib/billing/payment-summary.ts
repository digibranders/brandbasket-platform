/*
 * What every button that takes money shows before it opens a payment (components/panel/confirm-payment.tsx): what is paid for,
 * line by line, what is taken now, and what follows. Built on the server from the same figures the payment is made from, so the
 * dialog never works anything out.
 */

export interface PaymentSummaryRow {
  readonly key: string;
  readonly label: string;
  readonly amount: string;
  /** "save" for a discount, "free" for a line that costs nothing. */
  readonly tone: "plain" | "free" | "save";
}

export interface PaymentSummary {
  /** The dialog's title: what the customer is about to do. */
  readonly title: string;
  readonly rows: readonly PaymentSummaryRow[];
  /** "Due today", or "First payment on Thu 19 Nov" when nothing is taken now. */
  readonly totalLabel: string;
  readonly total: string;
  /** What follows, in order: the renewal, when the billing date moves, GST. */
  readonly notes: readonly string[];
}

/** "All prices include GST." for a price in rupees; nothing for dollars, which never mention it. */
export function gstNote(currency: "INR" | "USD"): readonly string[] {
  return currency === "INR" ? ["All prices include GST."] : [];
}
