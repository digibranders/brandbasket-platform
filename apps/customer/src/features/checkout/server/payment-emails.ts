import "server-only";
import { findBusinessAlertDetails, listReceiptsForBusiness, type Payment } from "@brandbasket/db";
import type { EmailAttachment } from "@brandbasket/email";
import { sendPaymentReceipt as sendReceipt, type PaymentEmailDeps } from "@brandbasket/shared/server/payment-emails";
import { customerEmailTransport } from "@/features/server-common/email";
import { generateSetPasswordUrl, SET_PASSWORD_LIFETIME_SECONDS } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { reportError } from "@/lib/report";
import { BRAND } from "../rules/brand";
import { isDownloadableReceipt, receiptDocument } from "../rules/receipt-document";
import { getStaffDb } from "./db";
import { renderReceiptsPdf } from "./receipt-pdf";

/*
 * Ported from apps/platform lib/server/payment-emails.ts (the receipt; failed-payment emails come from the webhook in
 * apps/platform). The staff connection writes the outbox, which the customer's own connection cannot; the transport is built
 * per send so a missing email configuration is caught here instead of failing a payment that has already committed.
 */

const SECONDS_PER_DAY = 24 * 60 * 60;
/** Receipts read to find one payment's: the newest of the business, far more than a first payment needs. */
const RECEIPTS_READ = 50;

/**
 * The receipt PDF for a payment that has no tax invoice (a payment in dollars), named as the download names it. Null when the
 * payment has no downloadable receipt yet or the business cannot be read.
 */
async function renderReceiptAttachment(payment: Pick<Payment, "id" | "businessId">): Promise<EmailAttachment | null> {
  const db = getStaffDb();
  const [details, receipts] = await Promise.all([findBusinessAlertDetails(db, payment.businessId), listReceiptsForBusiness(db, payment.businessId, RECEIPTS_READ)]);
  const receipt = receipts.find((candidate) => candidate.id === payment.id && isDownloadableReceipt(candidate));
  if (details === null || receipt === undefined) return null;
  const document = receiptDocument(receipt, { businessName: details.business.name, email: details.owner.email ?? "" }, BRAND);
  return { name: document.fileName, content: await renderReceiptsPdf([document], BRAND) };
}

/** The set-password block for a customer who has not chosen a password yet, else null (see generateSetPasswordUrl). */
async function setPasswordFor(email: string): Promise<{ readonly url: string; readonly lifetimeDays: number } | null> {
  const url = await generateSetPasswordUrl(email);
  return url === null ? null : { url, lifetimeDays: SET_PASSWORD_LIFETIME_SECONDS / SECONDS_PER_DAY };
}

/** What a payment email needs from this app: the transport, the origin, the receipt PDF and the first-password link. Shared with the webhook's wrapper. */
export function paymentEmailDeps(): PaymentEmailDeps {
  return {
    send: (message) => customerEmailTransport(getStaffDb()).send(message),
    dashboardOrigin: serverEnv().APP_ORIGIN,
    renderReceiptPdf: renderReceiptAttachment,
    setPassword: setPasswordFor,
  };
}

/**
 * Emails the customer a receipt for a payment that was applied. Call it after the payment's transaction has committed, for a
 * payment recorded for the first time. Best-effort: it never throws. The shared sender checks the outbox first, so a repeat
 * sends nothing.
 */
export async function sendPaymentReceipt(paymentId: string): Promise<void> {
  try {
    await sendReceipt(getStaffDb(), paymentEmailDeps(), paymentId);
  } catch (error) {
    reportError(error, { area: "checkout.payment-receipt" });
  }
}
