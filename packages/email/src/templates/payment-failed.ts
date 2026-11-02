import { emailBrandName } from "../brand";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";
import { assertMinorUnits, emailDate, emailGreeting, emailMoney, joinNames, type EmailCurrency } from "../format";

/** Where the plan stands for the customer: running to a date, or already paused. Null says nothing about it. */
export type PaymentFailedPlan = { readonly state: "active"; readonly until: Date } | { readonly state: "paused" };

export interface PaymentFailedInput {
  readonly to: string;
  /** The customer's full name; only the first word is used. Null for a greeting without a name. */
  readonly name: string | null;
  readonly currency: EmailCurrency;
  /** What could not be taken, in minor units of `currency`. */
  readonly amountCents: number;
  /** What the payment was for, by name. Empty names nothing. */
  readonly items: readonly string[];
  readonly plan: PaymentFailedPlan | null;
  /** Where the customer pays: Plan and billing on the dashboard, an absolute address. */
  readonly payUrl: string;
}

function planLine(plan: PaymentFailedPlan): string {
  return plan.state === "active"
    ? `Your plan stays active until ${emailDate(plan.until)}. After that it pauses until the payment is made.`
    : "Your plan is paused until the payment is made.";
}

/** Sent when a payment attempt did not go through. It promises nothing the access rule does not do: access ends on the paid-through date. */
export function paymentFailedEmail(input: PaymentFailedInput): EmailMessage {
  assertMinorUnits(input.amountCents, "amountCents");
  const payUrl = assertWebUrl(input.payUrl, "payUrl");

  const amount = emailMoney(input.amountCents, input.currency);
  const subject = "Your payment did not go through";
  const names = joinNames(input.items);
  const lines = [
    emailGreeting(input.name),
    names === "" ? `We could not take your payment of ${amount}.` : `We could not take your payment of ${amount} for ${names}.`,
    ...(input.plan === null ? [] : [planLine(input.plan)]),
  ];
  const help = "If you need help, reply to this email.";
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "payment-failed",
    bodyText: [...lines, `Pay now: ${payUrl}`, help, signOff].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Payment",
      heading: subject,
      body: [...lines.map(receiptParagraph), receiptButton(payUrl, "Pay now"), receiptParagraph(help), receiptParagraph(signOff)],
    }),
  };
}
