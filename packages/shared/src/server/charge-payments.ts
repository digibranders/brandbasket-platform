import "server-only";
import { recordChargePayment, type ChargePayment, type RecordedChargePayment, type ScopedTransaction } from "@brandbasket/db";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

/**
 * recordChargePayment, then the tax invoice for a charge it settled, last and in a savepoint (D7). Every charge payment
 * path goes through this, on the staff connection, under the business's billing lock. A payment that did not settle its
 * charge (a duplicate, a wrong amount, a stale move up) bought nothing and gets no invoice (D1).
 */
export async function recordChargePaymentWithInvoice(tx: ScopedTransaction, input: ChargePayment): Promise<RecordedChargePayment> {
  const recorded = await recordChargePayment(tx, input);
  if (recorded.outcome === "paid" && !recorded.alreadyRecorded) {
    await issueTaxInvoiceSafely(tx, recorded.payment, { kind: "charge", chargeId: input.chargeId });
  }
  return recorded;
}
