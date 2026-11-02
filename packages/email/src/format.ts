/** The currencies Brandbasket bills in (the database's billing_currency enum). */
export type EmailCurrency = "INR" | "USD";

const LOCALES: Readonly<Record<EmailCurrency, string>> = { INR: "en-IN", USD: "en-US" };
const MINOR_UNITS_PER_MAJOR = 100;
const DATE_LOCALE = "en-IN";
const DATE_ZONE = "Asia/Kolkata";

/** Throws unless the value is a whole number of minor units, so a float never reaches a customer as an amount. */
export function assertMinorUnits(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a whole number of minor units, received ${value}`);
}

/** "₹2,999" or "$65": whole amounts drop the decimals, as the dashboard does. */
export function emailMoney(minorUnits: number, currency: EmailCurrency): string {
  assertMinorUnits(minorUnits, "amount");
  const whole = minorUnits % MINOR_UNITS_PER_MAJOR === 0;
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / MINOR_UNITS_PER_MAJOR);
}

/** "15 November 2026", in India's time. */
export function emailDate(date: Date): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: DATE_ZONE }).format(date);
}

/** "Hi Asha," from a full name, or "Hello," when there is no name. */
export function emailGreeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return first === "" ? "Hello," : `Hi ${first},`;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
