/** The currencies Brandbasket bills in. Matches the database's billing_currency enum. */
export type MoneyCurrency = "USD" | "INR";

const LOCALES: Readonly<Record<MoneyCurrency, string>> = {
  USD: "en-US",
  INR: "en-IN",
};

const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Formats an amount held in minor units (cents or paise). Whole amounts drop the decimals, so the dashboard
 * says "$225" rather than "$225.00", while "$2.50" keeps them.
 */
export function formatMoney(minorUnits: number, currency: MoneyCurrency): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`Money must be a whole number of minor units, received ${minorUnits}`);
  }
  const whole = minorUnits % MINOR_UNITS_PER_MAJOR === 0;
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / MINOR_UNITS_PER_MAJOR);
}


/** "1,234.50" and "1234.5" both read as an amount; anything else, including a third decimal place, does not. */
const AMOUNT_PATTERN = /^[0-9]+(\.[0-9]{1,2})?$/;

/**
 * Reads an amount a person typed ("3,500", "12.34") as whole minor units. Returns null rather than rounding:
 * "1.234" is refused, because silently dropping the fraction would store a price nobody agreed to. Grouping
 * separators and surrounding space are ignored; a currency symbol, a sign or an exponent is not accepted.
 *
 * Built on strings and integer arithmetic throughout. Parsing to a float and multiplying by 100 would make
 * `parseMoney("12.34")` 1233.9999999999998, which is exactly the class of bug integer minor units exist to avoid.
 */
export function parseMoney(typed: string): number | null {
  const cleaned = typed.trim().replaceAll(",", "");
  if (!AMOUNT_PATTERN.test(cleaned)) return null;
  const [major = "", minor = ""] = cleaned.split(".");
  const minorUnits = Number(major) * MINOR_UNITS_PER_MAJOR + Number(minor.padEnd(2, "0"));
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}
