import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptRows } from "../receipt";

/** One line of what was paid for. A discount is a line with a negative amount. */
export interface PaymentReceivedLine {
  readonly label: string;
  readonly amountCents: number;
}

export interface PaymentReceivedInput {
  readonly to: string;
  /** Who to greet, or null for a greeting without a name. */
  readonly ownerName: string | null;
  readonly businessName: string;
  /** ISO 4217 code of the amounts, in minor units. */
  readonly currency: string;
  /** What the payment bought, GST included: the plan or the add-on, and any discount as a negative line. The lines add up to the total. */
  readonly lines: readonly PaymentReceivedLine[];
  readonly gstRatePercent: number;
  /** The GST inside the total, shown under it. */
  readonly gstCents: number;
  readonly totalCents: number;
  readonly paidAt: Date;
  /** Where the customer downloads the GST invoice for this payment. */
  readonly invoiceUrl: string;
  /** An absolute address of the Brandbasket email logo, a 360px wide PNG for a white background (mail apps do not show SVG): the dashboard serves it at /email/email-logo.png. */
  readonly logoUrl: string;
  /** The next charge, or null when there is none to announce. */
  readonly nextPayment: { readonly amountCents: number; readonly dueOn: Date } | null;
}

const MINOR_UNITS_PER_MAJOR = 100;
const LOCALE = "en-IN";
const DATE_ZONE = "Asia/Kolkata";

function assertMinorUnits(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a whole number of minor units, received ${value}`);
}

function money(cents: number, currency: string): string {
  const formatted = new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(Math.abs(cents) / MINOR_UNITS_PER_MAJOR);
  return cents < 0 ? `minus ${formatted}` : formatted;
}

function longDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: DATE_ZONE }).format(date);
}

/**
 * Sent when a payment has been received and recorded: a short receipt with what was paid for, the total, the GST inside it, a
 * button to the tax invoice and the date of the next payment. One template for every kind of payment (the first, a
 * renewal, an add-on); the caller says what each line is called.
 */
export function paymentReceivedEmail(input: PaymentReceivedInput): EmailMessage {
  for (const line of input.lines) assertMinorUnits(line.amountCents, `The amount of "${line.label}"`);
  assertMinorUnits(input.gstCents, "gstCents");
  assertMinorUnits(input.totalCents, "totalCents");
  if (input.nextPayment !== null) assertMinorUnits(input.nextPayment.amountCents, "nextPayment.amountCents");
  const invoiceUrl = assertWebUrl(input.invoiceUrl, "invoiceUrl");
  const logoUrl = assertWebUrl(input.logoUrl, "logoUrl");

  const total = money(input.totalCents, input.currency);
  const paidOn = longDate(input.paidAt);
  const greeting = input.ownerName === null ? "Hi," : `Hi ${input.ownerName},`;
  const intro = `${greeting} thank you for your payment.`;
  const subject = `We received your payment of ${total}`;
  const gstLabel = `Includes GST ${input.gstRatePercent}%`;
  const nextDetail =
    input.nextPayment === null ? null : `${money(input.nextPayment.amountCents, input.currency)} on ${longDate(input.nextPayment.dueOn)}.`;
  const next = nextDetail === null ? null : `Your next payment is ${nextDetail}`;
  const help = "Questions? Reply to this email or write to support@brandbasket.in.";

  const bodyText = [
    subject,
    `${paidOn}, ${input.businessName}`,
    intro,
    [...input.lines.map((line) => `${line.label}: ${money(line.amountCents, input.currency)}`), `Total paid: ${total}`, `${gstLabel}: ${money(input.gstCents, input.currency)}`].join("\n"),
    `Download your GST invoice: ${invoiceUrl}`,
    ...(next === null ? [] : [next]),
    help,
  ].join("\n\n");

  const rows = receiptRows(
    [
      ...input.lines.map((line) => ({ label: line.label, value: money(line.amountCents, input.currency) })),
      { label: "Total paid", value: total, strong: true },
      { label: gstLabel, value: money(input.gstCents, input.currency) },
    ],
    { wide: true },
  );

  const bodyHtml = receiptDocument({
    title: subject,
    kicker: `Receipt for ${input.businessName}`,
    heading: `We received your payment of ${total} on ${paidOn}.`,
    body: [receiptParagraph(intro), rows, receiptButton(invoiceUrl, "Download GST invoice"), ...(next === null ? [] : [receiptParagraph(next)])],
    footer: [help],
    preheader: "Thank you. Your GST invoice is ready to download.",
    logoUrl,
  });

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "payment-received",
    bodyText,
    bodyHtml,
  };
}
