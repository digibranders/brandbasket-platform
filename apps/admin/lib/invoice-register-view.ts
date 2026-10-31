import { indianDate } from "@brandbasket/billing";
import { gstStateCodeOf } from "@brandbasket/billing/gst-states";
import type { MissingTaxInvoice, TaxInvoice } from "@brandbasket/db";
import type { documentSeries, gstSummary } from "@brandbasket/shared/lib/billing/gst-summary";
import { adjacentMonth, monthRange, type RegisterInvoice, type RegisterTotals } from "@brandbasket/shared/lib/billing/invoice-register";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { missingInvoiceRow } from "@/lib/tax-invoice-rows";

/**
 * What the Invoices page says: the month, its links, each row and the totals, as plain data and wording with no markup,
 * so the words are tested without rendering.
 */

/** The month the page shows: `?month=` when it is a real month, else the current Indian month. Null means "not found". */
export function resolveRegisterMonth(param: string | readonly string[] | undefined, now: Date): string | null {
  if (param === undefined) return indianDate(now).slice(0, 7);
  if (typeof param !== "string") return null;
  return monthRange(param) === null ? null : param;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** "2026-10" as "October 2026". */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match === null ? undefined : MONTH_NAMES[Number(match[2]) - 1];
  if (match === null || name === undefined) throw new RangeError(`Expected a YYYY-MM month, received ${month}`);
  return `${name} ${match[1]}`;
}

export interface MonthLink {
  readonly href: string;
  readonly label: string;
}

export interface MonthLinks {
  /** Null in January 2000, the first month the register shows. */
  readonly previous: MonthLink | null;
  /** Null in December 2999, the last. */
  readonly next: MonthLink | null;
  readonly exportHref: string;
}

function linkTo(month: string | null): MonthLink | null {
  return month === null ? null : { href: `/invoices?month=${month}`, label: monthLabel(month) };
}

/** The previous and next month's page, and this month's CSV. The month is one `resolveRegisterMonth` returned. */
export function monthLinks(month: string): MonthLinks {
  return { previous: linkTo(adjacentMonth(month, -1)), next: linkTo(adjacentMonth(month, 1)), exportHref: `/invoices/export?month=${month}` };
}

/** Whole paise as "₹6,607.06": always two decimals (a register is read figure against figure), Indian grouping, no float maths. */
export function registerMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Money must be a whole number of paise, received ${cents}`);
  const absolute = Math.abs(cents);
  const rupees = new Intl.NumberFormat("en-IN").format(Math.trunc(absolute / 100));
  return `${cents < 0 ? "-" : ""}₹${rupees}.${String(absolute % 100).padStart(2, "0")}`;
}

export interface RegisterRowView {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  /** "GSTIN 27AAPFU0939F1ZV · Maharashtra · 9 October 2026". */
  readonly detail: string;
  readonly total: string;
  readonly downloadHref: string;
  readonly downloadLabel: string;
}

/** One invoice of the month. `id` is the invoice's id, for the staff download (`/invoices/{id}`). */
export function registerRow(id: string, invoice: RegisterInvoice): RegisterRowView {
  return {
    id,
    number: invoice.number,
    customer: invoice.recipientName,
    detail: [
      invoice.recipientGstin === null ? "Unregistered" : `GSTIN ${invoice.recipientGstin}`,
      stateName(invoice.placeOfSupplyStateCode) ?? invoice.placeOfSupplyStateCode,
      formatStoredDate(invoice.issuedOn),
    ].join(" · "),
    total: registerMoney(invoice.totalCents),
    downloadHref: `/invoices/${id}`,
    downloadLabel: `Download tax invoice ${invoice.number}`,
  };
}

export interface LabelledValue {
  readonly label: string;
  readonly value: string;
}

export interface RegisterTotalsView {
  readonly count: string;
  readonly figures: { readonly taxable: string; readonly total: string };
  readonly tax: readonly LabelledValue[];
  readonly split: readonly LabelledValue[];
}

function splitText(bucket: RegisterTotals["b2b"]): string {
  return `${bucket.count} ${bucket.count === 1 ? "invoice" : "invoices"}, ${registerMoney(bucket.taxableCents)} taxable, ${registerMoney(bucket.taxCents)} tax`;
}

/** The month's totals as words. Every figure here is a sum of the rows, as the CSV is. */
export function registerTotalsView(totals: RegisterTotals): RegisterTotalsView {
  return {
    count: String(totals.count),
    figures: { taxable: registerMoney(totals.taxableCents), total: registerMoney(totals.totalCents) },
    tax: [
      { label: "CGST", value: registerMoney(totals.cgstCents) },
      { label: "SGST", value: registerMoney(totals.sgstCents) },
      { label: "IGST", value: registerMoney(totals.igstCents) },
      { label: "Round off", value: registerMoney(totals.roundOffCents) },
    ],
    split: [
      { label: "With a GSTIN (B2B)", value: splitText(totals.b2b) },
      { label: "Without a GSTIN (B2C)", value: splitText(totals.b2c) },
    ],
  };
}

export interface MissingRegisterRowView {
  readonly paymentId: string;
  readonly businessId: string;
  readonly businessName: string;
  /** "₹3,539 on 9 October 2026": short, because the row truncates on a phone and these two facts must stay in view. */
  readonly detail: string;
  /** The client page's Tax invoices section, where the Issue invoice button is. */
  readonly href: string;
}

export function missingRegisterRow({ payment, businessName }: MissingTaxInvoice): MissingRegisterRowView {
  const row = missingInvoiceRow(payment);
  return { paymentId: row.paymentId, businessId: payment.businessId, businessName, detail: row.summary, href: `/clients/${payment.businessId}/billing#tax-invoices` };
}

/** The ZIP of the month's invoice PDFs and register. The month is one `resolveRegisterMonth` returned. */
export function exportZipHref(month: string): string {
  return `/invoices/export/zip?month=${month}`;
}

const SHORT_MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));

export interface FinancialYearChip {
  readonly month: string;
  readonly label: string;
  readonly href: string;
  readonly count: number;
  readonly current: boolean;
}

/** The twelve months of the financial year as links, each with how many invoices it holds, the open month marked. */
export function financialYearChips(selected: string, months: readonly { readonly month: string; readonly count: number }[]): readonly FinancialYearChip[] {
  // The register has no pages before January 2000 or after December 2999, so the edge years show fewer chips.
  return months.filter(({ month }) => monthRange(month) !== null).map(({ month, count }) => ({
    month,
    label: SHORT_MONTHS[Number(month.slice(5, 7)) - 1] ?? month,
    href: `/invoices?month=${month}`,
    count,
    current: month === selected,
  }));
}

/** 1800 as "18%", 150 as "1.50%": a rate is whole percent in practice, but a half point must not be rounded away. */
export function rateLabel(basisPoints: number): string {
  return basisPoints % 100 === 0 ? `${basisPoints / 100}%` : `${(basisPoints / 100).toFixed(2)}%`;
}

export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "27-Maharashtra", the form GSTR-1 asks for; a state GST does not know is shown by name alone. */
function placeText(stateCode: string): string {
  const name = stateName(stateCode) ?? stateCode;
  try {
    return `${gstStateCodeOf(stateCode)}-${name}`;
  } catch {
    return name;
  }
}

export interface RegisterTableRow {
  readonly id: string;
  readonly number: string;
  readonly date: string;
  readonly customer: string;
  /** "GSTIN 27AAPFU0939F1ZV" or "No GSTIN", then B2B or B2C. */
  readonly party: string;
  readonly place: string;
  /** The payment as printed on the invoice, with the provider's reference. */
  readonly payment: string;
  /** "Paid 9 October 2026" only when the money came in on another day than the invoice's. */
  readonly paid: string | null;
  readonly taxable: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly roundOff: string;
  readonly total: string;
  readonly downloadHref: string;
  readonly downloadLabel: string;
}

/** One invoice with every figure a CA reads off it: the register's detail row. */
export function registerTableRow(invoice: TaxInvoice): RegisterTableRow {
  return {
    id: invoice.id,
    number: invoice.number,
    date: formatStoredDate(invoice.issuedOn),
    customer: invoice.recipient.legalName,
    party: `${invoice.recipient.gstin === null ? "No GSTIN" : `GSTIN ${invoice.recipient.gstin}`}, ${invoice.recipient.gstin === null ? "B2C" : "B2B"}`,
    place: placeText(invoice.placeOfSupplyStateCode),
    payment: `${invoice.paymentLabel}, ${invoice.paymentReference}`,
    paid: invoice.paidOn === invoice.issuedOn ? null : `Paid ${formatStoredDate(invoice.paidOn)}`,
    taxable: registerMoney(invoice.taxableCents),
    cgst: registerMoney(invoice.cgstCents),
    sgst: registerMoney(invoice.sgstCents),
    igst: registerMoney(invoice.igstCents),
    roundOff: registerMoney(invoice.roundOffCents),
    total: registerMoney(invoice.totalCents),
    downloadHref: `/invoices/${invoice.id}`,
    downloadLabel: `Download tax invoice ${invoice.number}`,
  };
}

export interface RegisterFooterView {
  readonly taxable: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly roundOff: string;
  readonly total: string;
}

/** The register's last row: the month's sums, the same ones the figures and the CSV use. */
export function registerFooterView(totals: RegisterTotals): RegisterFooterView {
  return {
    taxable: registerMoney(totals.taxableCents),
    cgst: registerMoney(totals.cgstCents),
    sgst: registerMoney(totals.sgstCents),
    igst: registerMoney(totals.igstCents),
    roundOff: registerMoney(totals.roundOffCents),
    total: registerMoney(totals.totalCents),
  };
}

export interface GstSummaryView {
  /** GSTR-3B table 3.1(a), one value per tax head. */
  readonly outward: readonly LabelledValue[];
  /** GSTR-1 table 7, customers without a GSTIN, by place of supply and rate. */
  readonly b2c: readonly {
    readonly key: string;
    readonly place: string;
    readonly rate: string;
    readonly taxable: string;
    readonly cgst: string;
    readonly sgst: string;
    readonly igst: string;
  }[];
  /** GSTR-1 table 12, by SAC. */
  readonly hsn: readonly {
    readonly key: string;
    readonly sac: string;
    readonly description: string;
    readonly quantity: string;
    readonly taxable: string;
    readonly cgst: string;
    readonly sgst: string;
    readonly igst: string;
    readonly total: string;
  }[];
  /** Invoice numbers whose lines do not add up to their header, which a CA must look at before filing. */
  readonly mismatches: readonly string[];
}

/** The month's return summary as words and rupees. */
export function gstSummaryView(summary: ReturnType<typeof gstSummary>): GstSummaryView {
  const { outward } = summary;
  return {
    outward: [
      { label: "Taxable value", value: registerMoney(outward.taxableCents) },
      { label: "IGST", value: registerMoney(outward.igstCents) },
      { label: "CGST", value: registerMoney(outward.cgstCents) },
      { label: "SGST / UTGST", value: registerMoney(outward.sgstCents) },
      { label: "Cess", value: registerMoney(outward.cessCents) },
      { label: "Total tax", value: registerMoney(outward.taxCents) },
    ],
    b2c: summary.b2cByPlace.map((row) => ({
      key: `${row.stateCode}-${row.rateBasisPoints}`,
      place: placeText(row.stateCode),
      rate: rateLabel(row.rateBasisPoints),
      taxable: registerMoney(row.taxableCents),
      cgst: registerMoney(row.cgstCents),
      sgst: registerMoney(row.sgstCents),
      igst: registerMoney(row.igstCents),
    })),
    hsn: summary.hsn.map((row) => ({
      key: `${row.sac}-${row.description}`,
      sac: row.sac,
      description: row.description,
      quantity: String(row.quantity),
      taxable: registerMoney(row.taxableCents),
      cgst: registerMoney(row.cgstCents),
      sgst: registerMoney(row.sgstCents),
      igst: registerMoney(row.igstCents),
      total: registerMoney(row.totalCents),
    })),
    mismatches: summary.mismatches,
  };
}

export interface DocumentSeriesView {
  readonly key: string;
  readonly range: string;
  readonly detail: string;
  /** Serial numbers missing from the series up to this month, or null when it is whole. */
  readonly gaps: string | null;
}

/** GSTR-1 table 13: the numbers issued, how many, and whether the series has a hole. */
export function documentSeriesView(series: ReturnType<typeof documentSeries>): readonly DocumentSeriesView[] {
  return series.map((entry) => ({
    key: `${entry.prefix}-${entry.financialYear}`,
    range: entry.count === 1 ? entry.firstNumber : `${entry.firstNumber} to ${entry.lastNumber}`,
    detail: `${plural(entry.count, "invoice")} issued, 0 cancelled`,
    gaps: entry.missingSerials.length === 0 ? null : `Serial numbers missing from the series: ${entry.missingSerials.join(", ")}`,
  }));
}
