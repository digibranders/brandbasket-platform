import { indianDate } from "@firstfold/billing";
import type { Payment, TaxInvoice } from "@firstfold/db";
import { stateName } from "@firstfold/shared/lib/directory/india-states";
import { formatStoredDate } from "@firstfold/shared/lib/format";
import { formatMoney } from "@firstfold/shared/lib/money";

/**
 * What the client page's Tax invoices section says about each invoice and each payment still missing one. Plain data
 * and wording, no markup, so the words are tested without rendering.
 */

export interface TaxInvoiceRow {
  readonly id: string;
  readonly number: string;
  /** "Issued 15 November 2026 · paid 9 October 2026 · Maharashtra": the payment day only when it is another day. */
  readonly detail: string;
  /** The total with GST, in rupees. */
  readonly total: string;
  readonly downloadHref: string;
  readonly downloadLabel: string;
}

export function taxInvoiceRow(invoice: TaxInvoice): TaxInvoiceRow {
  const parts = [`Issued ${formatStoredDate(invoice.issuedOn)}`];
  // An invoice issued later by staff names the day the money came in; one issued with its payment is the same day.
  if (invoice.paidOn !== invoice.issuedOn) parts.push(`paid ${formatStoredDate(invoice.paidOn)}`);
  parts.push(stateName(invoice.placeOfSupplyStateCode) ?? invoice.placeOfSupplyStateCode);
  return {
    id: invoice.id,
    number: invoice.number,
    detail: parts.join(" · "),
    total: formatMoney(invoice.totalCents, "INR"),
    downloadHref: `/invoices/${invoice.id}`,
    downloadLabel: `Download tax invoice ${invoice.number}`,
  };
}

export interface MissingInvoiceRow {
  readonly paymentId: string;
  /** "₹3,539 on 9 October 2026": the amount and the Indian day, as the invoice prints it. The Invoices page shows it alone. */
  readonly summary: string;
  /** "Invoice missing for the payment of ₹3,539 on 9 October 2026". */
  readonly text: string;
  /** Names the payment for a screen reader, since a page can list several "Issue invoice" buttons. */
  readonly buttonLabel: string;
}

export function missingInvoiceRow(payment: Pick<Payment, "id" | "amountCents" | "paidAt">): MissingInvoiceRow {
  if (payment.paidAt === null) throw new RangeError(`Payment ${payment.id} has no paid date, so it cannot be missing an invoice`);
  const amount = formatMoney(payment.amountCents, "INR");
  const day = formatStoredDate(indianDate(payment.paidAt));
  return {
    paymentId: payment.id,
    summary: `${amount} on ${day}`,
    text: `Invoice missing for the payment of ${amount} on ${day}`,
    buttonLabel: `Issue invoice for the ${amount} payment of ${day}`,
  };
}
