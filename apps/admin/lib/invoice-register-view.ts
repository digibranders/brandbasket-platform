import { indianDate } from "@brandbasket/billing";
import type { MissingTaxInvoice } from "@brandbasket/db";
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
