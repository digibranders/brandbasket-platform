import "server-only";
import {
  AddOnAlreadyBillingError,
  AddOnSubscriptionNotFoundError,
  AddOnSubscriptionNotPayableError,
  lockAddOnSubscription,
  markAddOnCancelled,
  recordAddOnPayment,
  recordUnappliedAddOnPayment,
  type AddOnPaymentRecord,
  type RecordedAddOnPayment,
  type ScopedTransaction,
} from "@brandbasket/db";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

/**
 * The one path for a captured add-on payment, however it arrived (the Razorpay webhook or the fake checkout): record it,
 * move the add-on to active for the period it paid, and invoice it, all in the caller's staff transaction. The invoice
 * is the last write, and is issued in a savepoint, so a failed invoice never loses the payment. Idempotent on the
 * provider payment id: a redelivery records nothing and issues no second invoice.
 *
 * The refusals of recordAddOnPayment (AddOnAlreadyBillingError, AddOnSubscriptionNotPayableError and
 * AddOnPaymentConflictError) are not caught here. Callers use applyAddOnPayment, which wraps this call in a savepoint,
 * rolls back only the attempt, and records the money as unapplied for the first two.
 *
 * `predecessorsToCancel` comes back for the caller to cancel at the provider once the transaction has committed; the
 * provider is never called here.
 */
export async function activateAddOnPayment(tx: ScopedTransaction, record: AddOnPaymentRecord): Promise<RecordedAddOnPayment> {
  const recorded = await recordAddOnPayment(tx, record);
  if (!recorded.alreadyRecorded) {
    await issueTaxInvoiceSafely(tx, recorded.payment, {
      kind: "add_on",
      addOnSubscriptionId: record.addOnSubscriptionId,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
    });
  }
  return recorded;
}

/** A subscription at a provider, named so the caller can cancel it there once the transaction has committed. */
export type ProviderSubscriptionRef = RecordedAddOnPayment["predecessorsToCancel"][number];

/** Why money was taken for an add-on that could not be opened, in the words recordUnappliedAddOnPayment stores. */
export type RefusedAddOnPaymentReason = "already_paid" | "checkout_replaced";

export type AppliedAddOnPayment =
  /** The payment is recorded, the add-on is open and invoiced. Cancel the halted rows it replaced. */
  | { readonly kind: "applied"; readonly cancelAtProvider: readonly ProviderSubscriptionRef[] }
  /** The payment had been recorded before (a redelivery or a second click). Nothing was written, nothing to cancel. */
  | { readonly kind: "already-recorded"; readonly cancelAtProvider: readonly [] }
  /**
   * The money is kept for staff as an unapplied payment and nothing was opened. This row's own subscription is named
   * so the caller stops it at the provider: left running it would take a further payment next month for nothing.
   */
  | { readonly kind: "refused"; readonly reason: RefusedAddOnPaymentReason; readonly cancelAtProvider: readonly ProviderSubscriptionRef[] };

/**
 * Applies a captured add-on payment inside the caller's staff transaction, for both the Razorpay webhook and the fake
 * checkout, so the two cannot drift apart. The activation runs in a savepoint: a refusal rolls back only that attempt,
 * and the money can still be recorded.
 *
 * - AddOnAlreadyBillingError (another row of the add-on already bills): the payment is kept as `already_paid`, and
 *   this row is marked cancelled in the same transaction, since it will never run.
 * - AddOnSubscriptionNotPayableError (the checkout was cancelled): the payment is kept as `checkout_replaced`.
 * - Anything else, AddOnPaymentConflictError included, is rethrown for someone to look at.
 *
 * Idempotent on the provider payment id: a redelivery, even of a refused payment, writes nothing a second time and asks
 * for nothing to be cancelled. The provider is never called here; the caller cancels `cancelAtProvider` after commit.
 */
export async function applyAddOnPayment(tx: ScopedTransaction, record: AddOnPaymentRecord, now: Date): Promise<AppliedAddOnPayment> {
  try {
    const recorded = await tx.transaction((attempt) => activateAddOnPayment(attempt, record));
    return recorded.alreadyRecorded
      ? { kind: "already-recorded", cancelAtProvider: [] }
      : { kind: "applied", cancelAtProvider: recorded.predecessorsToCancel };
  } catch (error) {
    const reason = refusedReasonFor(error);
    if (reason === null) throw error;
    const row = await lockAddOnSubscription(tx, record.addOnSubscriptionId);
    if (row === null) throw new AddOnSubscriptionNotFoundError(record.addOnSubscriptionId);
    await recordUnappliedAddOnPayment(tx, { ...record, reason, now });
    if (reason === "already_paid") await markAddOnCancelled(tx, row.id, now);
    return { kind: "refused", reason, cancelAtProvider: [{ provider: row.provider, providerSubscriptionId: row.providerSubscriptionId }] };
  }
}

function refusedReasonFor(error: unknown): RefusedAddOnPaymentReason | null {
  if (error instanceof AddOnAlreadyBillingError) return "already_paid";
  if (error instanceof AddOnSubscriptionNotPayableError) return "checkout_replaced";
  return null;
}
