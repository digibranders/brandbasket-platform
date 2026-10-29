import type { TaxInvoice } from "@brandbasket/db";
import { stateName } from "../directory/india-states";
import { monthRange } from "./invoice-register";

/**
 * The figures a chartered accountant reads off the stored tax invoices to prepare GSTR-1 and GSTR-3B for a month. Pure:
 * it reads the shape of a stored invoice (a type import) and does no I/O. Every amount is integer paise and no figure is
 * divided, so no float can round one.
 */

/** The Indian financial year starts in April. */
const FIRST_MONTH_OF_FINANCIAL_YEAR = 4;

/** One Indian financial year: "2026-27" and its twelve "YYYY-MM" months, April first. */
export interface FinancialYear {
  readonly label: string;
  readonly months: readonly string[];
}

/** The first day of a financial year, and the first day of the next one (not part of it). */
export interface FinancialYearRange {
  readonly from: string;
  readonly to: string;
}

/** One month's invoice count and header total, for the month list on the page. */
export interface MonthTotal {
  readonly month: string;
  readonly count: number;
  readonly totalCents: number;
}

/** GSTR-3B table 3.1(a): outward supplies, from the invoice headers. */
export interface GstOutward {
  readonly taxableCents: number;
  readonly igstCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly cessCents: 0;
  readonly taxCents: number;
}

/** GSTR-1 table 7: B2C invoices by place of supply and rate, from the invoice lines. */
export interface B2cPlaceRow {
  readonly stateCode: string;
  readonly stateName: string;
  readonly rateBasisPoints: number;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
}

/** GSTR-1 table 12: outward supplies by HSN (SAC) and description, from the invoice lines. */
export interface HsnRow {
  readonly sac: string;
  readonly description: string;
  readonly quantity: number;
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly totalCents: number;
}

export interface GstSummary {
  readonly outward: GstOutward;
  readonly b2cByPlace: readonly B2cPlaceRow[];
  readonly hsn: readonly HsnRow[];
  /** True when every invoice's lines add up to its header figures. */
  readonly linesMatchHeaders: boolean;
  /** The numbers of the invoices whose lines do not add up to the header. */
  readonly mismatches: readonly string[];
}

/** The invoices of one (prefix, financial year) series that were issued in the month. */
export interface SeriesInMonth {
  readonly prefix: string;
  readonly financialYear: string;
  readonly count: number;
  readonly first: TaxInvoice;
  readonly last: TaxInvoice;
}

/** One series' numbering for the month, for the document-series table the CA checks for gaps. */
export interface DocumentSeries {
  readonly prefix: string;
  readonly financialYear: string;
  readonly firstNumber: string;
  readonly lastNumber: string;
  readonly count: number;
  /** Serials from 1 up to the month's highest serial that no invoice in the financial year to date uses. */
  readonly missingSerials: readonly number[];
}

const sumOf = <T>(items: readonly T[], pick: (item: T) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The year the financial year starts in: 2026 for October 2026 and for February 2027. Null for a non-month. */
function startYearOf(month: string): number | null {
  if (monthRange(month) === null) return null;
  const year = Number(month.slice(0, 4));
  return Number(month.slice(5, 7)) >= FIRST_MONTH_OF_FINANCIAL_YEAR ? year : year - 1;
}

/** The twelve "YYYY-MM" months of the financial year that starts in April of `startYear`. */
function monthsOf(startYear: number): readonly string[] {
  return Array.from({ length: 12 }, (_, offset) => {
    const monthNumber = ((FIRST_MONTH_OF_FINANCIAL_YEAR - 1 + offset) % 12) + 1;
    const year = startYear + (FIRST_MONTH_OF_FINANCIAL_YEAR - 1 + offset >= 12 ? 1 : 0);
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  });
}

/** The financial year a "YYYY-MM" month falls in, or null for anything that is not a month. */
export function financialYearOf(month: string): FinancialYear | null {
  const startYear = startYearOf(month);
  if (startYear === null) return null;
  return { label: `${startYear}-${String(startYear + 1).slice(-2)}`, months: monthsOf(startYear) };
}

/** The financial year a "YYYY-MM" month falls in, as the first day of April and of the next April. */
export function financialYearRange(month: string): FinancialYearRange | null {
  const startYear = startYearOf(month);
  if (startYear === null) return null;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-04-01` };
}

/** One entry per month in `months`, in that order: the invoices issued in it and their header totals. Zero when none. */
export function monthTotals(invoices: readonly TaxInvoice[], months: readonly string[]): readonly MonthTotal[] {
  return months.map((month) => {
    const issued = invoices.filter((invoice) => invoice.issuedOn.slice(0, 7) === month);
    return { month, count: issued.length, totalCents: sumOf(issued, (invoice) => invoice.totalCents) };
  });
}

function outwardOf(invoices: readonly TaxInvoice[]): GstOutward {
  const cgstCents = sumOf(invoices, (invoice) => invoice.cgstCents);
  const sgstCents = sumOf(invoices, (invoice) => invoice.sgstCents);
  const igstCents = sumOf(invoices, (invoice) => invoice.igstCents);
  return {
    taxableCents: sumOf(invoices, (invoice) => invoice.taxableCents),
    igstCents,
    cgstCents,
    sgstCents,
    cessCents: 0,
    taxCents: cgstCents + sgstCents + igstCents,
  };
}

function b2cByPlaceOf(invoices: readonly TaxInvoice[]): readonly B2cPlaceRow[] {
  const rows = new Map<string, B2cPlaceRow>();
  for (const invoice of invoices) {
    if (invoice.recipient.gstin !== null) continue;
    for (const line of invoice.lines) {
      const key = `${invoice.placeOfSupplyStateCode}|${line.taxRateBasisPoints}`;
      const row = rows.get(key) ?? {
        stateCode: invoice.placeOfSupplyStateCode,
        stateName: stateName(invoice.placeOfSupplyStateCode) ?? invoice.placeOfSupplyStateCode,
        rateBasisPoints: line.taxRateBasisPoints,
        taxableCents: 0,
        cgstCents: 0,
        sgstCents: 0,
        igstCents: 0,
      };
      rows.set(key, {
        ...row,
        taxableCents: row.taxableCents + line.taxableCents,
        cgstCents: row.cgstCents + line.cgstCents,
        sgstCents: row.sgstCents + line.sgstCents,
        igstCents: row.igstCents + line.igstCents,
      });
    }
  }
  return [...rows.values()].sort(
    (a, b) => compareText(a.stateName, b.stateName) || a.rateBasisPoints - b.rateBasisPoints,
  );
}

function hsnOf(invoices: readonly TaxInvoice[]): readonly HsnRow[] {
  const rows = new Map<string, Omit<HsnRow, "totalCents">>();
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const key = JSON.stringify([line.sac, line.description]);
      const row = rows.get(key) ?? {
        sac: line.sac,
        description: line.description,
        quantity: 0,
        taxableCents: 0,
        cgstCents: 0,
        sgstCents: 0,
        igstCents: 0,
      };
      rows.set(key, {
        ...row,
        quantity: row.quantity + line.quantity,
        taxableCents: row.taxableCents + line.taxableCents,
        cgstCents: row.cgstCents + line.cgstCents,
        sgstCents: row.sgstCents + line.sgstCents,
        igstCents: row.igstCents + line.igstCents,
      });
    }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, totalCents: row.taxableCents + row.cgstCents + row.sgstCents + row.igstCents }))
    .sort((a, b) => compareText(a.sac, b.sac) || compareText(a.description, b.description));
}

function linesAddUpTo(invoice: TaxInvoice): boolean {
  return (
    sumOf(invoice.lines, (line) => line.taxableCents) === invoice.taxableCents &&
    sumOf(invoice.lines, (line) => line.cgstCents) === invoice.cgstCents &&
    sumOf(invoice.lines, (line) => line.sgstCents) === invoice.sgstCents &&
    sumOf(invoice.lines, (line) => line.igstCents) === invoice.igstCents
  );
}

/** The GSTR-1 and GSTR-3B figures for a set of invoices, all from the stored rows. */
export function gstSummary(invoices: readonly TaxInvoice[]): GstSummary {
  const mismatches = invoices.filter((invoice) => !linesAddUpTo(invoice)).map((invoice) => invoice.number);
  return {
    outward: outwardOf(invoices),
    b2cByPlace: b2cByPlaceOf(invoices),
    hsn: hsnOf(invoices),
    linesMatchHeaders: mismatches.length === 0,
    mismatches,
  };
}

/**
 * The numbering of each (prefix, financial year) series issued in `monthInvoices`. `yearInvoices` is the financial year's
 * invoices up to the end of the month, so a serial missing from an earlier month is reported too. The month's own
 * invoices count as present even if `yearInvoices` leaves them out.
 */
export function documentSeries(
  monthInvoices: readonly TaxInvoice[],
  yearInvoices: readonly TaxInvoice[],
): readonly DocumentSeries[] {
  const groups = new Map<string, SeriesInMonth>();
  for (const invoice of monthInvoices) {
    const key = JSON.stringify([invoice.prefix, invoice.financialYear]);
    const group = groups.get(key);
    groups.set(
      key,
      group === undefined
        ? { prefix: invoice.prefix, financialYear: invoice.financialYear, count: 1, first: invoice, last: invoice }
        : {
            ...group,
            count: group.count + 1,
            first: invoice.serial < group.first.serial ? invoice : group.first,
            last: invoice.serial > group.last.serial ? invoice : group.last,
          },
    );
  }

  return [...groups.values()]
    .sort((a, b) => compareText(a.prefix, b.prefix) || compareText(a.financialYear, b.financialYear))
    .map((group) => {
      const inSeries = (invoice: TaxInvoice): boolean =>
        invoice.prefix === group.prefix && invoice.financialYear === group.financialYear;
      const present = new Set([...yearInvoices, ...monthInvoices].filter(inSeries).map((invoice) => invoice.serial));
      const missingSerials: number[] = [];
      for (let serial = 1; serial <= group.last.serial; serial += 1) {
        if (!present.has(serial)) missingSerials.push(serial);
      }
      return {
        prefix: group.prefix,
        financialYear: group.financialYear,
        firstNumber: group.first.number,
        lastNumber: group.last.number,
        count: group.count,
        missingSerials,
      };
    });
}
