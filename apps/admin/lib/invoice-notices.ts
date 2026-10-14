/** What the client page says after staff issue a missing invoice (`?invoice=`). Fixed messages only: the query picks one. */
export type InvoiceNotice =
  | "issued"
  | "not-missing"
  | "mismatch"
  | "refused"
  | "english-letters"
  | "date-before-payment"
  | "bad-period"
  | "unsupported-kind";

export const INVOICE_NOTICES: Readonly<Record<InvoiceNotice, { readonly text: string; readonly ok: boolean }>> = {
  issued: { text: "Invoice issued. It is dated today and lists the day the payment was made.", ok: true },
  "not-missing": { text: "That payment already has its invoice, or does not get one.", ok: false },
  mismatch: { text: "This payment’s figures do not match its plan. Ask engineering to issue it.", ok: false },
  refused: {
    text: "The invoice could not be issued with these billing details. Check the GSTIN and the state, then try again.",
    ok: false,
  },
  "english-letters": {
    text: "Some text on this invoice has characters it cannot print. Check the customer’s name and address in the billing details, and the payment’s description, then try again.",
    ok: false,
  },
  "date-before-payment": { text: "The issue date cannot be before the payment date.", ok: false },
  "bad-period": { text: "The service period for this payment is not valid. Ask engineering to issue it.", ok: false },
  "unsupported-kind": { text: "This kind of payment cannot be rebuilt here. Ask engineering to issue it.", ok: false },
};

/** `#tax-invoices` scrolls the reader to the Tax invoices section, since the notice renders inside it. */
export function invoiceNoticeHref(businessId: string, notice: InvoiceNotice): string {
  return `/clients/${businessId}?invoice=${notice}#tax-invoices`;
}

export function readInvoiceNotice(value: string | string[] | undefined): InvoiceNotice | null {
  return typeof value === "string" && Object.hasOwn(INVOICE_NOTICES, value) ? (value as InvoiceNotice) : null;
}
