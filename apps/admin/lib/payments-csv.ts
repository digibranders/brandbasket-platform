import type { StaffPaymentRow } from "@brandbasket/db";
import { rupees, textCell } from "@brandbasket/shared/lib/billing/invoice-register";
import { paymentInvoiceLabel, paymentKindLabel, paymentMethodLabel, paymentStatus } from "@/lib/payments-view";

const HEADER = [
  "Date",
  "Client",
  "For",
  "Method",
  "Status",
  "Currency",
  "Amount",
  "Refunded",
  "Provider payment id",
  "Invoice",
  "Failure reason",
  "Refund reason",
] as const;

const WHEN = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kolkata",
});

/** "2026-11-29 18:20", in India's time: a spreadsheet sorts it as text and reads it as a date. */
function csvWhen(date: Date): string {
  return WHEN.format(date).replace(", ", " ");
}

/** The month's payments for the CA, one row each. Customer-chosen text goes through textCell, so no cell runs as a formula. */
export function paymentsCsv(rows: readonly StaffPaymentRow[]): string {
  const lines = rows.map((row) =>
    [
      csvWhen(row.paidAt ?? row.createdAt),
      textCell(row.businessName),
      textCell(paymentKindLabel(row.kind)),
      textCell(paymentMethodLabel(row)),
      paymentStatus(row).label,
      row.currency,
      rupees(row.amountCents),
      row.refundedAmountCents === null ? "" : rupees(row.refundedAmountCents),
      textCell(row.providerPaymentId),
      textCell(paymentInvoiceLabel(row)),
      textCell(row.failureReason ?? ""),
      textCell(row.refundReason ?? ""),
    ].join(","),
  );
  return [HEADER.join(","), ...lines].join("\r\n");
}
