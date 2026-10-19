import type { BillingCurrency } from "@brandbasket/db";

/** The currencies staff can choose between, in the order the picker offers them. */
export const BILLING_CURRENCY_ORDER = ["USD", "INR"] as const satisfies readonly BillingCurrency[];

export const BILLING_CURRENCY_LABELS: Readonly<Record<BillingCurrency, string>> = {
  USD: "USD ($)",
  INR: "INR (₹)",
};

/** The symbol an amount field shows in front of what is typed, so "500" plainly means ₹500 or $500. */
export const BILLING_CURRENCY_SYMBOLS: Readonly<Record<BillingCurrency, string>> = {
  USD: "$",
  INR: "₹",
};
