import { formatMoney, type MoneyCurrency } from "./money";
import { formatIstTime, teamsCard, type TeamsMessage } from "./teams-webhook";

/*
 * The Teams card for a payment (docs/plans/28-teams-alert-catalogue.md): who paid, what for, how, and where to open them.
 * Pure: the announcer (server/payment-alerts.ts) gathers the facts, this words them.
 */

export type PaymentCardKind = "initial" | "renewal" | "reactivation" | "extra_publish" | "charge" | "add_on";

const KIND_LABELS: Readonly<Record<PaymentCardKind, string>> = {
  initial: "First payment",
  renewal: "Renewal",
  reactivation: "Reactivation",
  extra_publish: "Extra publish",
  charge: "One-off charge",
  add_on: "Add-on payment",
};

/** Why money arrived that staff must look at, in plain words. Mirrors the payment_attention_reason enum. */
const ATTENTION_LABELS: Readonly<Record<string, string>> = {
  checkout_replaced: "It paid a checkout that had already been replaced or cancelled. Nothing was activated.",
  already_paid: "The business already had access, so this is a duplicate charge to refund. Nothing was activated.",
  amount_mismatch: "The amount or currency was not what the plan expects. Nothing was activated.",
  upgrade_not_applied: "It paid a move up whose quote no longer stood. Nothing changed, so it is a payment to refund.",
  add_on_not_applied: "It paid for an add-on whose quote no longer stood. Nothing changed, so it is a payment to refund.",
  submission_failed: "The payment activated the plan, but sending the customer's setup answers failed.",
  upgrade_provider_pending: "The customer moved up, but the provider has not yet been told to bill the new price.",
  add_on_provider_pending: "The add-on is on, but the provider has not yet been told to bill it from the next renewal.",
};

/** Attention reasons where the money bought nothing: the title says so instead of "received". */
const NOTHING_BOUGHT = new Set(["checkout_replaced", "already_paid", "amount_mismatch", "upgrade_not_applied", "add_on_not_applied"]);

export interface PaymentCardLine {
  readonly title: string;
  readonly listCents: number;
  /** What the package offer took off this line, or 0. */
  readonly offerCents: number;
}

export interface PaymentCardInput {
  readonly kind: PaymentCardKind;
  readonly amountCents: number;
  readonly currency: MoneyCurrency;
  readonly paidAt: Date | null;
  readonly attentionReason: string | null;
  /** Which payment of the business this is: 1 for a new customer's first. */
  readonly paymentNumber: number;
  readonly provider: string;
  readonly providerPaymentId: string;
  readonly method: { readonly method: string | null; readonly cardNetwork: string | null; readonly cardType: string | null; readonly cardLast4: string | null; readonly upiVpa: string | null; readonly manualReference: string | null };
  readonly customer: { readonly name: string | null; readonly email: string | null; readonly phone: string | null };
  readonly business: { readonly name: string; readonly websiteUrl: string | null };
  readonly lines: readonly PaymentCardLine[];
  /** The referral or coupon code on the subscription, with what it takes off a month. */
  readonly code: { readonly code: string; readonly takesOffCents: number } | null;
  /** The ad money a month this checkout earned, or 0. */
  readonly adCreditCents: number;
  readonly paidThrough: Date | null;
  readonly invoice: { readonly number: string; readonly totalCents: number; readonly gstCents: number } | null;
  readonly billing: { readonly legalName: string; readonly gstin: string | null } | null;
  readonly consoleUrl: string;
}

/** "UPI (asha@okhdfc)", "Visa credit card ending 4242", "Bank transfer, ref UTR123", or what the provider called it. */
export function describePaymentMethod(method: PaymentCardInput["method"]): string | null {
  if (method.manualReference !== null) return `Recorded by hand, reference ${method.manualReference}`;
  if (method.method === null) return null;
  if (method.method === "upi") return method.upiVpa === null ? "UPI" : `UPI (${method.upiVpa})`;
  if (method.method === "card") {
    const brand = method.cardNetwork ?? "Card";
    const type = method.cardType === null ? "card" : `${method.cardType} card`;
    return `${brand} ${type}${method.cardLast4 === null ? "" : ` ending ${method.cardLast4}`}`;
  }
  return method.method;
}

export function paymentTeamsCard(input: PaymentCardInput): TeamsMessage {
  const money = (cents: number): string => formatMoney(cents, input.currency);
  const amount = money(input.amountCents);
  const attention = input.attentionReason;
  const bought = attention === null || !NOTHING_BOUGHT.has(attention);
  const newCustomer = input.kind === "initial" && input.paymentNumber === 1 && bought;
  const title = !bought
    ? `Payment needs attention: ${amount}`
    : newCustomer
      ? `New customer paid: ${amount}`
      : `${KIND_LABELS[input.kind]} received: ${amount}`;
  const offer = input.lines.reduce((total, line) => total + line.offerCents, 0);
  const gst = input.invoice === null ? null : `${money(input.invoice.gstCents)} GST inside`;
  return teamsCard({
    title,
    subtitle: `${input.business.name}${bought ? `, ${KIND_LABELS[input.kind].toLowerCase()}` : ""}`,
    facts: [
      { name: "Customer", value: input.customer.name },
      { name: "Email", value: input.customer.email },
      { name: "Phone", value: input.customer.phone },
      { name: "Business", value: input.business.name },
      { name: "Website", value: input.business.websiteUrl },
      { name: "Paid", value: gst === null ? amount : `${amount} (${gst})` },
      ...input.lines.map((line) => ({ name: line.title, value: money(line.listCents) })),
      { name: "Package offer", value: offer > 0 ? `-${money(offer)}` : null },
      { name: input.code === null ? "Code" : `Code ${input.code.code}`, value: input.code !== null && input.code.takesOffCents > 0 ? `-${money(input.code.takesOffCents)} a month` : input.code === null ? null : "No discount" },
      { name: "Ad money", value: input.adCreditCents > 0 ? `${money(input.adCreditCents)} a month` : null },
      { name: "Payment", value: input.paymentNumber > 1 ? `Payment number ${input.paymentNumber}` : "The customer's first payment" },
      { name: "Paid with", value: describePaymentMethod(input.method) },
      { name: "Paid on", value: input.paidAt === null ? null : formatIstTime(input.paidAt) },
      { name: "Runs until", value: bought && input.paidThrough !== null ? formatIstTime(input.paidThrough) : null },
      { name: "Invoice", value: input.invoice === null ? null : `${input.invoice.number}, ${money(input.invoice.totalCents)}` },
      { name: "Billed to", value: input.billing === null ? null : `${input.billing.legalName}${input.billing.gstin === null ? "" : `, GSTIN ${input.billing.gstin}`}` },
      { name: "Provider id", value: `${input.provider} ${input.providerPaymentId}` },
    ],
    text: attention === null ? null : (ATTENTION_LABELS[attention] ?? attention),
    open: { label: "Open the client", url: input.consoleUrl },
  });
}
