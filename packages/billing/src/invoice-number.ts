import { BillingRangeError } from "./billing-range-error";

/**
 * Tax invoice numbers: "FY/26-27/000147". One consecutive series per financial year (1 April to 31 March, in India),
 * at most 16 characters, as GST requires. The serial itself comes from the tax_invoice_series counter.
 */

/** The letters every tax invoice number starts with (see invoicePrefix). */
export const INVOICE_PREFIX = "FY";
/** The longest prefix that still leaves room for "/26-27/000147" within GST's 16 characters. */
const MAX_PREFIX_LENGTH = 3;
/** The largest serial that fits the six digits of the number format. */
export const MAX_INVOICE_SERIAL = 999_999;
const MAX_INVOICE_NUMBER_LENGTH = 16;
const FINANCIAL_YEAR_PATTERN = /^\d{2}-\d{2}$/;
const PREFIX_PATTERN = /^[A-Z0-9]+$/;

const IST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istParts(instant: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(IST_PARTS.formatToParts(instant).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * The series a deployment issues tax invoices under: INVOICE_PREFIX when set, otherwise FY. A prefix names a series of its own
 * (tax_invoice_series is keyed by prefix and financial year), so changing it starts a new series at 1 and never touches
 * invoices already issued under another one.
 */
export function invoicePrefix(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.INVOICE_PREFIX?.trim().toUpperCase() ?? "";
  if (configured === "") return INVOICE_PREFIX;
  if (!PREFIX_PATTERN.test(configured) || configured.length > MAX_PREFIX_LENGTH) {
    throw new BillingRangeError(`INVOICE_PREFIX must be 1 to ${MAX_PREFIX_LENGTH} upper-case letters or digits, received "${configured}"`);
  }
  return configured;
}

/** The calendar date in India, "2026-10-09". */
export function indianDate(instant: Date): string {
  const { year, month, day } = istParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "26-27" for any instant from 1 April 2026 to 31 March 2027, in India. */
export function financialYearOf(instant: Date): string {
  const { year, month } = istParts(instant);
  const start = month >= 4 ? year : year - 1;
  const two = (value: number): string => String(value % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/**
 * "FY/26-27/000147" from its three parts. Throws BillingRangeError for a prefix that is not upper-case letters and digits, a
 * financial year not written "26-27", a serial outside 1 to 999999, or a result longer than GST's 16 characters.
 */
export function formatInvoiceNumber(prefix: string, financialYear: string, serial: number): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new BillingRangeError(`An invoice prefix must be upper-case letters and digits`);
  }
  if (!FINANCIAL_YEAR_PATTERN.test(financialYear)) {
    throw new BillingRangeError(`A financial year must be written like 26-27`);
  }
  if (!Number.isSafeInteger(serial) || serial < 1 || serial > MAX_INVOICE_SERIAL) {
    throw new BillingRangeError(`An invoice serial must be 1 to ${MAX_INVOICE_SERIAL}, received ${serial}`);
  }
  const number = `${prefix}/${financialYear}/${String(serial).padStart(6, "0")}`;
  if (number.length > MAX_INVOICE_NUMBER_LENGTH) throw new BillingRangeError(`An invoice number can be at most ${MAX_INVOICE_NUMBER_LENGTH} characters`);
  return number;
}
