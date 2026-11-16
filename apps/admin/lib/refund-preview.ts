import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/** The settlement sentence of the customer's refund email (packages/email payment-refunded). A test keeps the two equal. */
export const REFUND_SETTLEMENT_LINE =
  "The refund has been sent back to your original payment method. Depending on your bank or card issuer, it usually appears on your statement in 5 to 10 business days.";

/** What a refund leaves alone: executePaymentRefund marks the payment and issues the credit note, nothing more. */
export const REFUND_STAYS_ACTIVE_LINE = "The plan and the website are not changed by a refund. Cancel the plan separately if the customer is leaving.";

export interface RefundPreviewInput {
  readonly currency: MoneyCurrency;
  readonly paymentCents: number;
  readonly refundCents: number;
  readonly reason: string;
  /** The payment's tax invoice number; null when none was issued, so there is nothing to credit. */
  readonly invoiceNumber: string | null;
}

export interface RefundPreview {
  readonly isFull: boolean;
  /** The line the dialog states before the staff member confirms. */
  readonly consequence: string;
  readonly creditNote: string;
  readonly subject: string;
  /** The body paragraphs of the email the customer gets, in order. */
  readonly emailLines: readonly string[];
}

/** What a refund will do and say, or null while the amount is not a refund of this payment (zero or more than was paid). */
export function refundPreview(input: RefundPreviewInput): RefundPreview | null {
  const { currency, paymentCents, refundCents } = input;
  if (!Number.isSafeInteger(refundCents) || refundCents < 1 || refundCents > paymentCents) return null;
  const amount = formatMoney(refundCents, currency);
  const original = formatMoney(paymentCents, currency);
  const isFull = refundCents === paymentCents;
  const reason = input.reason.trim();
  return {
    isFull,
    consequence: `${amount} goes back to the customer through the payment provider, a credit note is issued and the customer is emailed. This cannot be undone.`,
    creditNote:
      input.invoiceNumber === null
        ? "No credit note, because this payment has no tax invoice."
        : `A GST credit note will be issued against invoice ${input.invoiceNumber}.`,
    subject: `Refund processed: ${amount}`,
    emailLines: [
      isFull ? `We have processed a full refund of ${amount}.` : `We have processed a partial refund of ${amount} (original payment of ${original}).`,
      ...(input.invoiceNumber === null ? [] : ["A credit note has been issued under its own number, shown in the email."]),
      ...(reason === "" ? [] : [`Reason: ${reason}`]),
      REFUND_SETTLEMENT_LINE,
    ],
  };
}
