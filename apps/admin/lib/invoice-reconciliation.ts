import { isUnappliedReason, type StaffPaymentRow, type TaxInvoice } from "@brandbasket/db";
import { plural, registerMoney, type LabelledValue } from "@/lib/invoice-register-view";
import { lacksInvoice } from "@/lib/payments-view";

/**
 * How the month's money lines up with its invoices: what came in, what has an invoice, what still needs one and what
 * is only there for a CA to know about. Rupee payments only: a dollar payment gets no GST invoice. There are no credit
 * notes, so a refunded payment that was invoiced is called out rather than netted off.
 */
export function reconciliationItems(payments: readonly StaffPaymentRow[], invoices: readonly TaxInvoice[], month: string): readonly LabelledValue[] {
  const rupees = payments.filter((row) => row.currency === "INR");
  const sum = (rows: readonly StaffPaymentRow[]): number => rows.reduce((total, row) => total + row.amountCents, 0);
  const received = rupees.filter((row) => row.status !== "failed");
  const toInvoice = rupees.filter(lacksInvoice);
  const boughtNothing = rupees.filter((row) => row.status === "captured" && isUnappliedReason(row.attentionReason));
  const refundedInvoiced = rupees.filter((row) => row.status === "refunded" && row.invoiceNumber !== null);
  const failed = rupees.filter((row) => row.status === "failed");
  const earlier = invoices.filter((invoice) => invoice.paidOn.slice(0, 7) < month);
  const dollars = payments.filter((row) => row.currency !== "INR" && row.status !== "failed");
  const money = (rows: readonly StaffPaymentRow[]): string => `${plural(rows.length, "payment")}, ${registerMoney(sum(rows))}`;
  return [
    { label: "Received in the month", value: money(received) },
    { label: "Invoice still to issue", value: money(toInvoice) },
    { label: "Invoiced this month for payments of an earlier month", value: `${plural(earlier.length, "invoice")}, ${registerMoney(earlier.reduce((total, invoice) => total + invoice.totalCents, 0))}` },
    { label: "Paid but bought nothing, so no invoice", value: money(boughtNothing) },
    { label: "Refunded after an invoice was issued (no credit note)", value: money(refundedInvoiced) },
    { label: "Failed attempts", value: money(failed) },
    ...(dollars.length === 0 ? [] : [{ label: "Dollar payments (no GST invoice)", value: plural(dollars.length, "payment") }]),
  ];
}
