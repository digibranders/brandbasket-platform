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

export interface PaymentCardInput {
  readonly kind: PaymentCardKind;
  readonly amountCents: number;
  readonly currency: MoneyCurrency;
  readonly attentionReason: string | null;
  /** Which payment of the business this is: 1 for a new customer's first. */
  readonly paymentNumber: number;
  readonly provider: string;
  readonly providerPaymentId: string;
  readonly method: { readonly method: string | null; readonly cardNetwork: string | null; readonly cardType: string | null; readonly cardLast4: string | null; readonly upiVpa: string | null; readonly manualReference: string | null };
  readonly customer: { readonly name: string | null; readonly email: string | null; readonly phone: string | null };
  readonly business: { readonly name: string; readonly websiteUrl: string | null };
  /** What was bought: the services a plan payment billed, the add-on, or the one-off charge's description. */
  readonly services: readonly string[];
  readonly invoice: { readonly number: string; readonly gstCents: number } | null;
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
  return teamsCard({
    title,
    subtitle: `${input.business.name}${bought ? `, ${KIND_LABELS[input.kind].toLowerCase()}` : ""}`,
    facts: [
      { name: "Customer", value: input.customer.name },
      { name: "Mobile", value: input.customer.phone },
      { name: "Email", value: input.customer.email },
      { name: "Website", value: input.business.websiteUrl },
      { name: "Paid", value: input.invoice === null ? amount : `${amount} (${money(input.invoice.gstCents)} GST inside)` },
      { name: "Bought", value: input.services.join(", ") },
      { name: "Paid with", value: describePaymentMethod(input.method) },
      { name: "Invoice", value: input.invoice?.number },
      // Only for money that bought nothing: staff need it to find the payment at the provider and refund it.
      { name: "Provider id", value: bought ? null : `${input.provider} ${input.providerPaymentId}` },
    ],
    text: attention === null ? null : (ATTENTION_LABELS[attention] ?? attention),
    open: { label: "Open the client", url: input.consoleUrl },
  });
}

/** The plan states staff are told about: a charge Razorpay is retrying, billing that stopped, and a plan that ended. */
export type PlanStatusAlert = "past_due" | "inactive" | "cancelled";

const PLAN_STATUS_TITLES: Readonly<Record<PlanStatusAlert, string>> = {
  past_due: "Payment failed, Razorpay is retrying",
  inactive: "Billing stopped",
  cancelled: "Plan ended",
};

const PLAN_STATUS_TEXT: Readonly<Record<PlanStatusAlert, string>> = {
  past_due: "A renewal charge did not go through. The customer keeps access until the period they paid for runs out. A reminder to update their payment method helps.",
  inactive: "Razorpay gave up on the charge, or the plan was paused. Access has ended. Reach out to the customer to bring them back.",
  cancelled: "The plan has ended at Razorpay, whether the customer cancelled or it ran its course.",
};

export interface PlanStatusCardInput {
  readonly status: PlanStatusAlert;
  readonly providerStatus: string;
  readonly customer: PaymentCardInput["customer"];
  readonly business: PaymentCardInput["business"];
  readonly paidThrough: Date | null;
  readonly consoleUrl: string;
}

export function planStatusTeamsCard(input: PlanStatusCardInput): TeamsMessage {
  return teamsCard({
    title: `${PLAN_STATUS_TITLES[input.status]}: ${input.business.name}`,
    facts: [
      { name: "Customer", value: input.customer.name },
      { name: "Mobile", value: input.customer.phone },
      { name: "Email", value: input.customer.email },
      { name: "Website", value: input.business.websiteUrl },
      { name: "Razorpay says", value: input.providerStatus },
      { name: "Paid until", value: input.paidThrough === null ? null : formatIstTime(input.paidThrough) },
    ],
    text: PLAN_STATUS_TEXT[input.status],
    open: { label: "Open the client", url: input.consoleUrl },
  });
}
