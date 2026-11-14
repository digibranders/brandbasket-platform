import { emailBrandName } from "../brand";
import { assertMinorUnits, emailDate, emailGreeting, emailMoney, joinNames, type EmailCurrency } from "../format";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface FirstChargeReminderInput {
  readonly to: string;
  readonly name: string | null;
  readonly currency: EmailCurrency;
  readonly amountCents: number;
  readonly chargeDate: Date;
  readonly items?: readonly string[];
  readonly billingUrl?: string;
  readonly businessId?: string;
}

/**
 * Reminder email sent before the first full-price charge after an introductory offer period (e.g. ₹1 first month).
 * Sent once per business, containing the upcoming charge date and amount.
 */
export function firstChargeReminderEmail(input: FirstChargeReminderInput): EmailMessage {
  assertMinorUnits(input.amountCents, "amountCents");
  const billingUrl = input.billingUrl !== undefined ? assertWebUrl(input.billingUrl, "billingUrl") : null;

  const amount = emailMoney(input.amountCents, input.currency);
  const date = emailDate(input.chargeDate);
  const subject = `Upcoming renewal: ${amount} on ${date}`;
  const names = input.items && input.items.length > 0 ? joinNames(input.items) : "";

  const lines = [
    emailGreeting(input.name),
    "Your introductory offer is coming to an end soon.",
    names === ""
      ? `Your next payment of ${amount} will be taken on ${date}.`
      : `Your next payment of ${amount} for ${names} will be taken on ${date}.`,
    "You can review or change your payment method on your dashboard anytime.",
  ];
  const help = "If you have questions or wish to cancel before your renewal, reply to this email.";
  const signOff = emailBrandName();

  const bodyParts = [...lines];
  if (billingUrl !== null) {
    bodyParts.push(`Review payment method: ${billingUrl}`);
  }
  bodyParts.push(help, signOff);

  const htmlBody = [
    ...lines.map(receiptParagraph),
    ...(billingUrl !== null ? [receiptButton(billingUrl, "Review payment method")] : []),
    receiptParagraph(help),
    receiptParagraph(signOff),
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "first-charge-reminder",
    bodyText: bodyParts.join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Billing",
      heading: subject,
      body: htmlBody,
    }),
  };
}
