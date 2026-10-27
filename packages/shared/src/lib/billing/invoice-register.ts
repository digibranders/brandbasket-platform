import { gstStateCodeOf } from "@brandbasket/billing/gst-states";
import type { TaxInvoice } from "@brandbasket/db";
import { stateName } from "../directory/india-states";

/**
 * The monthly invoice register the CA files GSTR-1 and GSTR-3B from. Pure and browser-safe: it only reads the shape of
 * a stored invoice (a type import), so the page, the CSV route and the tests all share one set of sums.
 */

/** One invoice as the register needs it: what GSTR-1 asks for, per invoice. */
export interface RegisterInvoice {
  readonly number: string;
  /** YYYY-MM-DD, the Indian date of issue. */
  readonly issuedOn: string;
  readonly recipientName: string;
  readonly recipientGstin: string | null;
  /** Platform state code ("mh"), as stored. */
  readonly placeOfSupplyStateCode: string;
  /** Every invoice has one SAC today; if its lines ever differ they are joined with " / ". */
  readonly sac: string;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

export interface RegisterBucket {
  readonly count: number;
  readonly taxableCents: number;
  readonly taxCents: number;
}

export interface RegisterTotals {
  readonly count: number;
  /** Invoices to a customer who gave a GSTIN. */
  readonly b2b: RegisterBucket;
  /** Invoices to a customer with no GSTIN. */
  readonly b2c: RegisterBucket;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

const taxOf = (invoice: RegisterInvoice): number => invoice.cgstCents + invoice.sgstCents + invoice.igstCents;

const sumOf = (invoices: readonly RegisterInvoice[], pick: (invoice: RegisterInvoice) => number): number =>
  invoices.reduce((total, invoice) => total + pick(invoice), 0);

function bucket(invoices: readonly RegisterInvoice[]): RegisterBucket {
  return { count: invoices.length, taxableCents: sumOf(invoices, (invoice) => invoice.taxableCents), taxCents: sumOf(invoices, taxOf) };
}

/** A month's figures. Every total is the sum of the rows, so the page and the CSV always agree with each other. */
export function registerTotals(invoices: readonly RegisterInvoice[]): RegisterTotals {
  return {
    count: invoices.length,
    b2b: bucket(invoices.filter((invoice) => invoice.recipientGstin !== null)),
    b2c: bucket(invoices.filter((invoice) => invoice.recipientGstin === null)),
    taxableCents: sumOf(invoices, (invoice) => invoice.taxableCents),
    cgstCents: sumOf(invoices, (invoice) => invoice.cgstCents),
    sgstCents: sumOf(invoices, (invoice) => invoice.sgstCents),
    igstCents: sumOf(invoices, (invoice) => invoice.igstCents),
    roundOffCents: sumOf(invoices, (invoice) => invoice.roundOffCents),
    totalCents: sumOf(invoices, (invoice) => invoice.totalCents),
  };
}

export interface MonthRange {
  /** The month's first day, YYYY-MM-DD. */
  readonly from: string;
  /** The next month's first day: the end of the range, not part of it. */
  readonly to: string;
}

/**
 * "2026-10" as the first day of that month and of the next, or null for anything that is not a month. Only the years
 * 2000 to 2999 are months: outside them there is no register worth reading, and a year at either end has a neighbour
 * that is not a date (PostgreSQL has no year 0000 and the page has no year 10000), which used to end in a 500.
 */
export function monthRange(month: string): MonthRange | null {
  const match = /^(2\d{3})-(0[1-9]|1[0-2])$/.exec(month);
  if (match === null) return null;
  const year = Number(match[1]);
  const index = Number(match[2]);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

/**
 * The month before or after a "YYYY-MM" month, for the page's previous and next links. Null for a non-month, and at
 * either end of the supported years (before January 2000, after December 2999), where there is no link to show.
 */
export function adjacentMonth(month: string, step: 1 | -1): string | null {
  const range = monthRange(month);
  if (range === null) return null;
  const neighbour = step === 1 ? range.to.slice(0, 7) : previousMonthOf(month);
  return monthRange(neighbour) === null ? null : neighbour;
}

function previousMonthOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, "0")}`;
}

/** Whole paise as rupees with two decimals, worked out from the integer so no float can round a figure. */
export function rupees(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Quotes a CSV cell when it holds a comma, a quote or a line break. */
function quoted(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * A text cell. A customer chooses their own name, and a spreadsheet runs a cell that starts with = + - @ tab or a
 * carriage return as a formula, so such a cell gets a leading apostrophe (shown as text, not run). Only text goes through
 * here: the money columns are ours, and a negative round off must stay a number.
 */
export function textCell(value: string): string {
  return quoted(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
}

const HEADER = [
  "Invoice number",
  "Invoice date",
  "Customer",
  "GSTIN",
  "Type",
  "Place of supply",
  "SAC",
  "Taxable value",
  "CGST",
  "SGST",
  "IGST",
  "Round off",
  "Invoice total",
] as const;

/** "2026-10-09" as "09-10-2026", the date format Indian accounting tools import. */
function indianDateText(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (year === undefined || month === undefined || day === undefined) throw new RangeError(`Not a YYYY-MM-DD date: ${isoDate}`);
  return `${day}-${month}-${year}`;
}

/** "27-Maharashtra": the code GSTR-1 asks for, then the name. An unknown code throws, so a wrong state never reaches a return. */
function placeOfSupplyText(stateCode: string): string {
  return `${gstStateCodeOf(stateCode)}-${stateName(stateCode) ?? stateCode}`;
}

/**
 * One invoice could not be written to the register, for example because its state is not one GST knows. The message
 * names the invoice number and nothing about the customer, so staff can find the invoice from the log; the reason is
 * the `cause`.
 */
export class RegisterInvoiceError extends Error {
  readonly invoiceNumber: string;

  constructor(invoiceNumber: string, cause: unknown) {
    super(`Invoice ${invoiceNumber} cannot be written to the register`, { cause });
    this.name = "RegisterInvoiceError";
    this.invoiceNumber = invoiceNumber;
  }
}

/**
 * The month's register as CSV, the way Indian accounting tools import it: DD-MM-YYYY dates, plain rupee figures, a Type
 * column (B2B when the customer gave a GSTIN, else B2C), CRLF line ends. No byte order mark: the export route adds it.
 * An invoice that cannot be written throws a RegisterInvoiceError naming it: a register with a row left out would be
 * filed as if it were whole.
 */
export function registerCsv(invoices: readonly RegisterInvoice[]): string {
  const rows = invoices.map((invoice) => csvRow(invoice));
  return [HEADER.join(","), ...rows].join("\r\n");
}

function csvRow(invoice: RegisterInvoice): string {
  try {
    return [
      textCell(invoice.number),
      indianDateText(invoice.issuedOn),
      textCell(invoice.recipientName),
      textCell(invoice.recipientGstin ?? ""),
      invoice.recipientGstin === null ? "B2C" : "B2B",
      textCell(placeOfSupplyText(invoice.placeOfSupplyStateCode)),
      textCell(invoice.sac),
      rupees(invoice.taxableCents),
      rupees(invoice.cgstCents),
      rupees(invoice.sgstCents),
      rupees(invoice.igstCents),
      rupees(invoice.roundOffCents),
      rupees(invoice.totalCents),
    ].join(",");
  } catch (error) {
    throw new RegisterInvoiceError(invoice.number, error);
  }
}

/** The SACs on an invoice's lines, each once, in order, joined with " / ". */
function sacOf(invoice: TaxInvoice): string {
  return [...new Set(invoice.lines.map((line) => line.sac))].join(" / ");
}

/** A stored invoice as a register row. */
export function registerInvoiceOf(invoice: TaxInvoice): RegisterInvoice {
  return {
    number: invoice.number,
    issuedOn: invoice.issuedOn,
    recipientName: invoice.recipient.legalName,
    recipientGstin: invoice.recipient.gstin,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    sac: sacOf(invoice),
    taxableCents: invoice.taxableCents,
    cgstCents: invoice.cgstCents,
    sgstCents: invoice.sgstCents,
    igstCents: invoice.igstCents,
    roundOffCents: invoice.roundOffCents,
    totalCents: invoice.totalCents,
  };
}
