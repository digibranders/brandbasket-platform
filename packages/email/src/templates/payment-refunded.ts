import { emailBrandName } from "../brand";
import { assertMinorUnits, emailGreeting, emailMoney, joinNames, type EmailCurrency } from "../format";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface PaymentRefundedInput {
  readonly to: string;
  /** The customer's full name; only the first word is used. Null for a greeting without a name. */
  readonly name: string | null;
  readonly currency: EmailCurrency;
  /** What was refunded, in minor units of `currency`. */
  readonly refundedAmountCents: number;
  /** The original payment amount, in minor units of `currency`. */
  readonly originalAmountCents: number;
  /** What the original payment bought, by name. */
  readonly items: readonly string[];
  /** Why it was refunded, if shared with customer. */
  readonly reason?: string | null;
  /** The credit note number, when one was issued (for INR tax invoices). */
  readonly creditNoteNumber?: string | null;
  /** Where the customer views receipts or billing: an absolute address on the dashboard. */
  readonly billingUrl: string;
}

/**
 * Sent when a payment has been refunded to the customer.
 * Describes the refunded amount, whether full or partial, items, credit note number (if issued),
 * and expected timeline for bank settlement.
 */
export function paymentRefundedEmail(input: PaymentRefundedInput): EmailMessage {
  assertMinorUnits(input.refundedAmountCents, "refundedAmountCents");
  if (input.refundedAmountCents <= 0) {
    throw new RangeError(`refundedAmountCents must be greater than 0, received ${input.refundedAmountCents}`);
  }
  assertMinorUnits(input.originalAmountCents, "originalAmountCents");

  const billingUrl = assertWebUrl(input.billingUrl, "billingUrl");

  const refundedAmount = emailMoney(input.refundedAmountCents, input.currency);
  const originalAmount = emailMoney(input.originalAmountCents, input.currency);
  const subject = sanitizeHeaderValue(`Refund processed: ${refundedAmount}`);
  const names = joinNames(input.items);

  const isFullRefund = input.refundedAmountCents === input.originalAmountCents;
  const refundDetailLine = isFullRefund
    ? names === ""
      ? `We have processed a full refund of ${refundedAmount}.`
      : `We have processed a full refund of ${refundedAmount} for ${names}.`
    : names === ""
      ? `We have processed a partial refund of ${refundedAmount} (original payment of ${originalAmount}).`
      : `We have processed a partial refund of ${refundedAmount} for ${names} (original payment of ${originalAmount}).`;

  const lines = [
    emailGreeting(input.name),
    refundDetailLine,
    ...(input.creditNoteNumber ? [`A credit note has been issued under number ${input.creditNoteNumber}.`] : []),
    ...(input.reason ? [`Reason: ${input.reason}`] : []),
    "The refund has been sent back to your original payment method. Depending on your bank or card issuer, it usually appears on your statement in 5 to 10 business days.",
  ];
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "payment-refunded",
    bodyText: [...lines, `View billing details: ${billingUrl}`, signOff].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Refund",
      heading: subject,
      body: [
        ...lines.map(receiptParagraph),
        receiptParagraph("View billing details:"),
        receiptButton(billingUrl, "View billing details"),
        receiptParagraph(signOff),
      ],
    }),
  };
}
