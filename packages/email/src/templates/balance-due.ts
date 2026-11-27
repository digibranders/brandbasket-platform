import { emailBrandName } from "../brand";
import { assertMinorUnits, emailGreeting, emailMoney, type EmailCurrency } from "../format";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface BalanceDueInput {
  readonly to: string;
  readonly name: string | null;
  readonly businessName: string;
  readonly currency: EmailCurrency;
  /** What is left of the website build after the advance: 0 when the advance paid it all. */
  readonly balanceCents: number;
  /** The app's checkout, where the balance is paid. */
  readonly checkoutUrl: string;
  /** True for the reminder sent every three days while the balance is unpaid. */
  readonly reminder?: boolean;
}

/**
 * Plan 66. Sent when staff mark a paid deal's website ready (and again every three days while the balance is unpaid): the website is
 * ready, and it goes live once the balance and the first period of the plan are paid. New copy for the owner.
 */
export function balanceDueEmail(input: BalanceDueInput): EmailMessage {
  assertMinorUnits(input.balanceCents, "balanceCents");
  const checkoutUrl = assertWebUrl(input.checkoutUrl, "checkoutUrl");
  const subject = input.reminder === true ? "Reminder: pay the balance to put your website live" : "Your website is ready: pay the balance to go live";
  const lines = [
    emailGreeting(input.name),
    `Your website for ${input.businessName} is ready.`,
    input.balanceCents > 0
      ? `The balance of your website build is ${emailMoney(input.balanceCents, input.currency)}. You pay it together with the first period of your plan, and your website goes live once that is done.`
      : "Your advance covered the whole website build. Your website goes live once you pay the first period of your plan.",
  ];
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "balance-due",
    bodyText: [...lines, `Pay and go live: ${checkoutUrl}`, signOff].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Website ready",
      heading: subject,
      body: [...lines.map(receiptParagraph), receiptButton(checkoutUrl, "Pay and go live"), receiptParagraph(signOff)],
    }),
  };
}
