import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { BillingCurrency } from "@brandbasket/db";

/** India's calling code. No other country shares it, so the code alone places a number in India. */
const INDIA_CALLING_CODE = "91";

/**
 * The currency a new lead is billed in, read from its phone number: India in INR, everywhere else in USD — the rule
 * staff already apply by hand ("India is billed in INR; everywhere else in USD" on the lead page).
 *
 * Every lead used to start in USD whatever its number, so an Indian lead that nobody switched was invited, signed up,
 * and then asked for $75 at checkout. This makes the right answer the default; staff can still change it on the lead
 * until the customer starts paying.
 *
 * A number without a country code cannot be placed, and a lead with no number at all has nothing to place, so both keep
 * the USD default rather than guessing.
 */
export function billingCurrencyForPhone(phone: string | null): BillingCurrency {
  if (phone === null) return "USD";
  const parsed = parsePhoneNumberFromString(phone.trim(), { extract: false });
  return parsed?.countryCallingCode === INDIA_CALLING_CODE ? "INR" : "USD";
}
