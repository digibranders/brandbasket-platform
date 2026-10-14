/** What pressing Get it, Resume, Pay now or Keep it came to, when it did not leave the page for the payment. */
export type AddOnStartState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialAddOnStartState: AddOnStartState = { status: "idle" };

/**
 * What the purchase dialog says about the invoice: nothing for a business that gets no tax invoices, a prompt to add
 * billing details when it has given none, or who the invoice will be made out to.
 */
export type AddOnInvoiceNote =
  | { readonly kind: "none" }
  | { readonly kind: "missing" }
  | { readonly kind: "saved"; readonly legalName: string; readonly gstin: string | null };
