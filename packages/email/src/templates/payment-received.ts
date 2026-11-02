import { emailBrandName } from "../brand";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { assertMinorUnits, emailDate, emailGreeting, emailMoney, joinNames, type EmailCurrency } from "../format";

export interface PaymentReceivedInput {
  readonly to: string;
  /** The customer's full name; only the first word is used. Null for a greeting without a name. */
  readonly name: string | null;
  readonly currency: EmailCurrency;
  /** What was paid, in minor units of `currency`, GST included. */
  readonly amountCents: number;
  /** What the payment bought, by name: the services of a plan, an add-on or a charge's description. Empty names nothing. */
  readonly items: readonly string[];
  /** The GST rate inside an INR payment, from its tax invoice; null when there is none. Never printed for USD. */
  readonly gstRatePercent: number | null;
  /** The end of the period a plan payment paid for; null for an add-on or a charge, or when unknown. */
  readonly paidThrough: Date | null;
  /** The plan's next payment; null when there is none to announce or it is not known. */
  readonly nextPayment: { readonly amountCents: number; readonly on: Date } | null;
  /** Where the customer downloads the receipt: an absolute address on the dashboard. */
  readonly receiptUrl: string;
}

function paidUpLine(input: PaymentReceivedInput): string | null {
  const parts = [
    input.paidThrough === null ? null : `Your plan is paid up to ${emailDate(input.paidThrough)}.`,
    input.nextPayment === null
      ? null
      : `Your next payment of ${emailMoney(input.nextPayment.amountCents, input.currency)} is taken on ${emailDate(input.nextPayment.on)}.`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * Sent when a payment has been received and applied: the first payment, a renewal, a reactivation, an add-on or a charge.
 * One template for all of them; the caller says what each was for. GST is named only on an INR payment whose tax invoice
 * carried a rate, and no figure is worked out here.
 */
export function paymentReceivedEmail(input: PaymentReceivedInput): EmailMessage {
  assertMinorUnits(input.amountCents, "amountCents");
  if (input.nextPayment !== null) assertMinorUnits(input.nextPayment.amountCents, "nextPayment.amountCents");
  const receiptUrl = assertWebUrl(input.receiptUrl, "receiptUrl");

  const amount = emailMoney(input.amountCents, input.currency);
  const subject = sanitizeHeaderValue(`Payment received: ${amount}`);
  const names = joinNames(input.items);
  const lines = [
    emailGreeting(input.name),
    names === "" ? `We have received your payment of ${amount}.` : `We have received your payment of ${amount} for ${names}.`,
    ...(input.currency === "INR" && input.gstRatePercent !== null ? [`Includes GST at ${input.gstRatePercent}%.`] : []),
    ...[paidUpLine(input)].filter((line): line is string => line !== null),
  ];
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "payment-received",
    bodyText: [...lines, `Download your receipt: ${receiptUrl}`, signOff].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Receipt",
      heading: subject,
      body: [...lines.map(receiptParagraph), receiptParagraph("Download your receipt:"), receiptButton(receiptUrl, "Download receipt"), receiptParagraph(signOff)],
    }),
  };
}
