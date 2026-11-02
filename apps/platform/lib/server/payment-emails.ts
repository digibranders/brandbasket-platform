import "server-only";
import { sendPaymentFailed as sendFailed, sendPaymentReceipt as sendReceipt, type FailedPaymentEmail, type PaymentEmailDeps } from "@brandbasket/shared/server/payment-emails";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";

// The staff connection writes the outbox, which the customer's own connection cannot; the transport is built per send so a
// missing email configuration is caught by the best-effort wrapper instead of failing a payment that has already committed.
function deps(): PaymentEmailDeps {
  return { send: (message) => customerEmailTransport(getStaffDb()).send(message), dashboardOrigin: serverEnv().APP_ORIGIN };
}

/**
 * Emails the customer a receipt for a payment that was applied. Call it after the payment's transaction has committed, for a
 * payment recorded for the first time, beside announcePaymentToTeams. Best-effort: it never throws.
 */
export async function sendPaymentReceipt(paymentId: string): Promise<void> {
  try {
    await sendReceipt(getStaffDb(), deps(), paymentId);
  } catch (error) {
    console.error("[payment-email] A payment receipt could not be sent.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}

/** Emails the customer that a payment failed. Call it once, when the failure was recorded for the first time. Best-effort: it never throws. */
export async function sendPaymentFailed(input: FailedPaymentEmail): Promise<void> {
  try {
    await sendFailed(getStaffDb(), deps(), input);
  } catch (error) {
    console.error("[payment-email] A failed-payment email could not be sent.", { error: error instanceof Error ? error.name : "error" });
  }
}
