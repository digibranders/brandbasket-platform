import { assertWebUrl, escapeHtml, sanitizeHeaderValue, type EmailMessage } from "../message";
import { emailBrandName } from "../brand";

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
  /** An absolute address of the dark Brandbasket logo as a PNG (mail apps do not show SVG). */
  readonly logoUrl: string;
  /** The next charge, or null when there is none to announce. */
  readonly nextPayment: { readonly amountCents: number; readonly dueOn: Date } | null;
}

const INK = "#0c1e2e";
const MUTED = "#565d64";
const LINE = "#e8e7e3";
const HEADER = "#102234";
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
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

function row(label: string, amount: string, options: { readonly total?: boolean } = {}): string {
  const border = options.total === true ? `border-top:1px solid ${INK};` : `border-top:1px solid ${LINE};`;
  const weight = options.total === true ? "font-weight:600;" : "";
  const labelColor = options.total === true ? "" : `color:${MUTED};`;
  const padding = options.total === true ? "12px 0" : "10px 0";
  return [
    "<tr>",
    `<td style="padding:${padding};${border}${labelColor}${weight}">${escapeHtml(label)}</td>`,
    `<td align="right" style="padding:${padding};${border}${weight}white-space:nowrap">${escapeHtml(amount)}</td>`,
    "</tr>",
  ].join("");
}

/**
 * Sent when a payment has been received and recorded: a short receipt with what was paid for, the total, the GST inside it, a
 * button to the tax invoice and the date of the next payment. One template for every kind of payment (the first, a
 * renewal, an add-on); the caller says what each line is called.
 */
export function paymentReceivedEmail(input: PaymentReceivedInput): EmailMessage {
  const brand = emailBrandName();
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

  const rows = [
    ...input.lines.map((line) => row(line.label, money(line.amountCents, input.currency))),
    row("Total paid", total, { total: true }),
    row(gstLabel, money(input.gstCents, input.currency)),
  ].join("\n");

  const bodyHtml = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(subject)}</title>`,
    "</head>",
    `<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};color:${INK}">`,
    '<div style="display:none;max-height:0;overflow:hidden">Thank you. Your GST invoice is ready to download.</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">',
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px">',
    `<tr><td style="padding-bottom:36px;border-bottom:3px solid ${HEADER}"><img src="${escapeHtml(logoUrl)}" width="160" alt="${escapeHtml(brand)}" style="display:block;border:0;height:auto"></td></tr>`,
    `<tr><td style="padding:32px 0 6px;font-size:14px;color:${MUTED}">Receipt for ${escapeHtml(input.businessName)}</td></tr>`,
    `<tr><td style="padding:0 0 24px;font-size:24px;line-height:1.3;font-weight:500">We received your payment of ${escapeHtml(total)} on ${escapeHtml(paidOn)}.</td></tr>`,
    `<tr><td style="padding:0 0 28px;font-size:15px;line-height:1.65;color:#2f3f4d;overflow-wrap:anywhere">${escapeHtml(intro)}</td></tr>`,
    `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">`,
    rows,
    "</table></td></tr>",
    `<tr><td style="padding:28px 0 32px"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:${HEADER};color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;padding:12px 20px;border-radius:6px">Download GST invoice</a></td></tr>`,
    ...(next === null ? [] : [`<tr><td style="padding:0 0 32px;font-size:14px;line-height:1.65;color:${MUTED}">${escapeHtml(next)}</td></tr>`]),
    `<tr><td style="padding-top:20px;border-top:1px solid ${LINE};font-size:12px;line-height:1.7;color:#7b8189">Questions? Reply to this email or write to <a href="mailto:support@brandbasket.in" style="color:#7b8189">support@brandbasket.in</a>.<br>${escapeHtml(brand)}</td></tr>`,
    "</table>",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ].join("\n");

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "payment-received",
    bodyText,
    bodyHtml,
  };
}
