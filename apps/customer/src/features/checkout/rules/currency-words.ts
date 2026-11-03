import type { MoneyCurrency } from "@brandbasket/shared/lib/money";

/** The plural name of the currency a business is billed in, for sentences that say what a figure is in. */
export const CURRENCY_NAMES: Readonly<Record<MoneyCurrency, string>> = { INR: "rupees", USD: "dollars" };

/**
 * The sentence that says what the prices are in. GST is named only for a taxed plan: a dollar plan has no GST and its
 * customer is never told about it.
 */
export function pricesNote(currency: MoneyCurrency, taxed: boolean): string {
  return `Prices are in ${CURRENCY_NAMES[currency]}${taxed ? " and include GST" : ""}.`;
}
