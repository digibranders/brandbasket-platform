import "server-only";
import type { BillingProvider } from "@brandbasket/billing";
import {
  applyPaymentRefund,
  findTaxInvoiceByPaymentId,
  isUuid,
  lockPaymentForRefund,
  type CreditNote,
  type Database,
  type Payment,
  type ScopedTransaction,
  type TaxInvoice,
} from "@brandbasket/db";
import { issueCreditNote } from "./tax-invoicing";

export interface ExecutePaymentRefundInput {
  readonly paymentId: string;
  readonly businessId: string;
  readonly refundedAmountCents: number;
  readonly reason: string;
  readonly staffUserId: string;
  readonly now?: Date;
  /** Optional dependency injection for testing invoice lookup. */
  readonly findInvoice?: (tx: ScopedTransaction, paymentId: string) => Promise<TaxInvoice | null>;
}

export type ExecutePaymentRefundResult =
  | {
      readonly kind: "refunded";
      readonly payment: Payment;
      readonly providerRefundId: string;
      readonly creditNote: CreditNote | null;
      readonly cancelledEarnings: number;
      readonly paidEarnings: number;
    }
  | { readonly kind: "already-refunded" }
  | { readonly kind: "not-refundable" }
  | { readonly kind: "amount-too-high" }
  | { readonly kind: "provider-failed"; readonly error: string };

class ProviderRefundFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRefundFailure";
  }
}

/**
 * Executes a real refund through the configured billing provider, marks the payment as refunded in the database,
 * issues a GST credit note if an invoice exists, and cancels any owed affiliate earnings.
 *
 * Concurrency & Idempotency:
 * Takes a PostgreSQL transaction-scoped advisory lock on the payment ID, ensuring that concurrent requests
 * for the same payment are serialized. The first caller processes the refund, and subsequent callers observe
 * the status as already refunded and return "already-refunded" without calling the provider or duplicating credit notes.
 *
 * Provider Failure Safety:
 * If the provider call throws, the database transaction is aborted, leaving the payment captured and untouched.
 */
export async function executePaymentRefund(
  db: Database,
  provider: BillingProvider,
  input: ExecutePaymentRefundInput,
): Promise<ExecutePaymentRefundResult> {
  if (!isUuid(input.paymentId) || !isUuid(input.businessId)) {
    return { kind: "not-refundable" };
  }

  const now = input.now ?? new Date();

  try {
    return await db.transaction(async (tx): Promise<ExecutePaymentRefundResult> => {
      const locked = await lockPaymentForRefund(tx, input.paymentId, input.businessId);
      if (locked.kind === "already-refunded") return { kind: "already-refunded" };
      if (locked.kind === "not-refundable") return { kind: "not-refundable" };

      const payment = locked.payment;
      if (
        !Number.isInteger(input.refundedAmountCents) ||
        input.refundedAmountCents < 1 ||
        input.refundedAmountCents > payment.amountCents
      ) {
        return { kind: "amount-too-high" };
      }

      // 1. Call provider refund API. If this fails, throw to rollback transaction.
      let providerRefundResult;
      try {
        providerRefundResult = await provider.refundPayment({
          providerPaymentId: payment.providerPaymentId,
          amountCents: input.refundedAmountCents,
          reason: input.reason,
        });
      } catch (error) {
        throw new ProviderRefundFailure(error instanceof Error ? error.message : "Provider refund failed");
      }

      // 2. Mark payment refunded and cancel owed affiliate earnings
      const applied = await applyPaymentRefund(tx, {
        paymentId: payment.id,
        refundedAmountCents: input.refundedAmountCents,
        reason: input.reason,
        staffUserId: input.staffUserId,
        now,
      });

      // 3. Issue credit note linked to tax invoice, if one exists
      let creditNote: CreditNote | null = null;
      const lookupInvoice = input.findInvoice ?? findTaxInvoiceByPaymentId;
      const invoice = await lookupInvoice(tx, payment.id);

      if (invoice !== null) {
        const issued = await issueCreditNote(tx, payment, invoice, input.refundedAmountCents, input.reason, {
          issuedAt: now,
        });
        creditNote = issued.creditNote;
      }

      return {
        kind: "refunded",
        payment,
        providerRefundId: providerRefundResult.providerRefundId,
        creditNote,
        cancelledEarnings: applied.cancelledEarnings,
        paidEarnings: applied.paidEarnings,
      };
    });
  } catch (error) {
    if (error instanceof ProviderRefundFailure) {
      return { kind: "provider-failed", error: error.message };
    }
    throw error;
  }
}
