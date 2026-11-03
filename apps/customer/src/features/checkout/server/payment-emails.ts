import "server-only";
import { sendPaymentReceipt as sendReceipt, type PaymentEmailDeps } from "@brandbasket/shared/server/payment-emails";
import { customerEmailTransport } from "@/features/server-common/email";
import { serverEnv } from "@/lib/env";
import { reportError } from "@/lib/report";
import { getStaffDb } from "./db";

/*
 * Ported from apps/platform lib/server/payment-emails.ts (the receipt; failed-payment emails come from the webhook in
 * apps/platform). The staff connection writes the outbox, which the customer's own connection cannot; the transport is built
 * per send so a missing email configuration is caught here instead of failing a payment that has already committed.
 */
function deps(): PaymentEmailDeps {
  return { send: (message) => customerEmailTransport(getStaffDb()).send(message), dashboardOrigin: serverEnv().APP_ORIGIN };
}

/**
 * Emails the customer a receipt for a payment that was applied. Call it after the payment's transaction has committed, for a
 * payment recorded for the first time. Best-effort: it never throws. The shared sender checks the outbox first, so a repeat
 * sends nothing.
 */
export async function sendPaymentReceipt(paymentId: string): Promise<void> {
  try {
    await sendReceipt(getStaffDb(), deps(), paymentId);
  } catch (error) {
    reportError(error, { area: "checkout.payment-receipt" });
  }
}
