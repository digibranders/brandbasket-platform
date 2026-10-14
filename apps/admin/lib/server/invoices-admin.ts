import "server-only";
import { BillingRangeError, InvalidGstinError, InvoiceAmountMismatchError, UnknownStateError } from "@firstfold/billing";
import { lockBusinessForBilling } from "@firstfold/db";
import { describeError, logBillingEvent } from "@firstfold/shared/server/billing-log";
import {
  InvoiceSourceMismatchError,
  issueMissingTaxInvoice,
  NoMissingInvoiceError,
  UnsupportedPaymentKindError,
} from "@firstfold/shared/server/tax-invoice-reissue";
import {
  InvalidServicePeriodError,
  InvoiceDatedBeforePaymentError,
  UnprintableInvoiceTextError,
} from "@firstfold/shared/server/tax-invoicing";
import type { InvoiceNotice } from "@/lib/invoice-notices";
import { getStaffDb } from "./db";

/**
 * Issues a client's missing invoice, dated `now` (D16), under the billing lock every payment path takes, so it cannot
 * race a payment being recorded. What goes wrong because of the data comes back as a notice for the client page; a
 * refusal is logged without the customer's details. Anything else, a lost connection for one, is rethrown. The caller
 * must have checked the signed-in staff member and passes their user id as `issuedBy`, which the audit line names:
 * `tax-invoice-issued` is logged once the transaction has committed, so it never records an invoice that was rolled back.
 */
export async function issueClientMissingInvoice(
  businessId: string,
  paymentId: string,
  now: Date,
  issuedBy: string,
): Promise<InvoiceNotice> {
  try {
    const invoice = await getStaffDb().transaction(async (tx) => {
      await lockBusinessForBilling(tx, businessId);
      return issueMissingTaxInvoice(tx, businessId, paymentId, now);
    });
    logBillingEvent("info", "tax-invoice-issued", { businessId, paymentId, provider: null, invoiceNumber: invoice.number, issuedBy });
    return "issued";
  } catch (error) {
    if (error instanceof NoMissingInvoiceError) return "not-missing";
    const notice = noticeForRefusal(error);
    if (notice === null) throw error;
    logBillingEvent("warn", "tax-invoice-failed", { businessId, paymentId, provider: null, ...describeError(error) });
    return notice;
  }
}

/** The notice for an error the data causes and staff can act on, or null for any other error. */
function noticeForRefusal(error: unknown): InvoiceNotice | null {
  if (error instanceof InvoiceSourceMismatchError || error instanceof InvoiceAmountMismatchError) return "mismatch";
  if (error instanceof UnsupportedPaymentKindError) return "unsupported-kind";
  // Staff can fix a name or address (D12), a GSTIN or a state; a date or period out of order is nothing they typed.
  if (error instanceof UnprintableInvoiceTextError) return "english-letters";
  if (error instanceof InvoiceDatedBeforePaymentError) return "date-before-payment";
  if (error instanceof InvalidServicePeriodError) return "bad-period";
  if (error instanceof InvalidGstinError || error instanceof UnknownStateError) return "refused";
  // Any other bad figure is for engineering, like a price that explains nothing.
  if (error instanceof BillingRangeError) return "mismatch";
  return null;
}
