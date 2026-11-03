import "server-only";
import { hasBillingAccess } from "@brandbasket/billing";
import {
  findBundledAddOnsForSubscription,
  findBusinessAlertDetails,
  findLatestSubscriptionForBusiness,
  findPaymentAlertBase,
  findPlanById,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  hasEmailContaining,
  isPhoneAccountEmail,
  isUnappliedReason,
  type AlertPerson,
  type BillingCurrency,
  type Database,
  type Payment,
  type TaxInvoice,
} from "@brandbasket/db";
import { paymentFailedEmail, paymentReceivedEmail, type EmailMessage, type PaymentFailedPlan } from "@brandbasket/email";
import { nextBundledNetCents, nextDiscountCents } from "../lib/billing/bundle";
import { nextPaymentDate } from "../lib/billing/period";
import { paymentsContinue } from "../lib/billing/payments-continue";
import { receiptDownloadHref } from "../lib/billing/receipt-download";
import { renewalChargeCents } from "../lib/billing/terms";
import { emailPreferenceAllows } from "./email-preference";
import { paymentServiceNames, serviceTitle } from "./payment-alerts";

/** Where the customer pays: Plan and billing on the dashboard. */
const BILLING_PATH = "/billing";
const RECEIPT_TEMPLATE = "payment-received";
const BASIS_POINTS_PER_PERCENT = 100;
/** Payments of these kinds pay for a stretch of the plan, so the email can say what it is paid up to. */
const PLAN_PAYMENT_KINDS: ReadonlySet<Payment["kind"]> = new Set(["initial", "renewal", "reactivation"]);

export interface PaymentEmailDeps {
  /** Delivers one message: the app's customer transport. Called only when there is someone to write to. */
  readonly send: (message: EmailMessage) => Promise<void>;
  /** The dashboard's origin, for the links in the email. */
  readonly dashboardOrigin: string;
}

/** The address to write to for a business: its owner's, unless the owner signs in with a phone number and has none. */
function recipientOf(owner: AlertPerson): string | null {
  return owner.email === null || isPhoneAccountEmail(owner.email) ? null : owner.email;
}

/** The one GST rate every line of an INR payment's tax invoice carries, as a percentage; null when there is no invoice, no tax or mixed rates. */
function gstRatePercent(currency: BillingCurrency, invoice: TaxInvoice | null): number | null {
  if (currency !== "INR" || invoice === null) return null;
  const rates = new Set(invoice.lines.map((line) => line.taxRateBasisPoints));
  const [only] = [...rates];
  return rates.size === 1 && only !== undefined && only > 0 ? only / BASIS_POINTS_PER_PERCENT : null;
}

/** What a plan payment paid up to, and what the plan takes next and when, as the billing page words them. Nulls where unknown. */
async function planPeriodOf(db: Database, payment: Payment, now: Date) {
  if (!PLAN_PAYMENT_KINDS.has(payment.kind) || payment.subscriptionId === null) return { paidThrough: null, nextPayment: null };
  const subscription = await findSubscriptionById(db, payment.subscriptionId);
  if (subscription === null) return { paidThrough: null, nextPayment: null };
  const on = paymentsContinue(subscription) ? nextPaymentDate(subscription, now) : null;
  const plan = on === null ? null : await findPlanById(db, subscription.planId);
  const amountCents = plan === null ? null : renewalChargeCents(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  return { paidThrough: subscription.paidThroughAt, nextPayment: on === null || amountCents === null ? null : { amountCents, on } };
}

/**
 * Emails the paying customer that a payment was received: the first payment, a renewal, a reactivation, an add-on or a paid extra.
 * Call it after the payment's transaction has committed, for a payment that was applied, beside announcePaymentToTeams. A payment
 * that bought nothing (kept for staff to refund) or has been refunded sends nothing.
 *
 * Idempotent without a key of its own: the receipt link names the payment, so an outbox row of this template to this address that
 * holds the link says it was sent. The caller sends only for a payment recorded for the first time, which is what keeps two
 * deliveries that race (the webhook and the return page) from both passing this check. Best-effort: it never throws.
 */
export async function sendPaymentReceipt(db: Database, deps: PaymentEmailDeps, paymentId: string, now: Date = new Date()): Promise<void> {
  try {
    const base = await findPaymentAlertBase(db, paymentId);
    if (base === null) return;
    const { payment, owner } = base;
    if (payment.status !== "captured" || isUnappliedReason(payment.attentionReason)) return;
    const to = recipientOf(owner);
    if (to === null) return;
    const receiptUrl = new URL(receiptDownloadHref([payment.id]), deps.dashboardOrigin).toString();
    const alreadySent = await hasEmailContaining(db, { template: RECEIPT_TEMPLATE, toAddress: to, text: receiptUrl, since: payment.createdAt });
    if (alreadySent) return;
    const [items, invoice, period] = await Promise.all([
      paymentServiceNames(db, payment),
      findTaxInvoiceByPaymentId(db, payment.id),
      planPeriodOf(db, payment, now),
    ]);
    await deps.send(
      paymentReceivedEmail({
        to,
        name: owner.name,
        currency: payment.currency,
        amountCents: payment.amountCents,
        items,
        gstRatePercent: gstRatePercent(payment.currency, invoice),
        paidThrough: period.paidThrough,
        nextPayment: period.nextPayment,
        receiptUrl,
      }),
    );
  } catch (error) {
    console.error("[payment-email] A payment receipt could not be sent.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}

export interface FailedPaymentEmail {
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  /** What an extra charge was for; null for a payment of the plan. */
  readonly chargeDescription: string | null;
}

/** Where the plan stands after a failed payment of it: running to its paid-through date, or paused. Null when it never started, and for an extra, which pauses nothing. */
async function planAfterFailure(db: Database, businessId: string, now: Date): Promise<PaymentFailedPlan | null> {
  const subscription = await findLatestSubscriptionForBusiness(db, businessId);
  if (subscription === null || subscription.activatedAt === null) return null;
  return hasBillingAccess(subscription, now) && subscription.paidThroughAt !== null
    ? { state: "active", until: subscription.paidThroughAt }
    : { state: "paused" };
}

/** The services of the business's newest subscription, or the extra's description. */
async function failedPaymentItems(db: Database, input: FailedPaymentEmail): Promise<readonly string[]> {
  if (input.chargeDescription !== null) return [input.chargeDescription];
  const subscription = await findLatestSubscriptionForBusiness(db, input.businessId);
  if (subscription === null) return [];
  return (await findBundledAddOnsForSubscription(db, subscription.id)).filter((line) => line.status !== "removed").map((line) => serviceTitle(line.addOn));
}

/**
 * Emails the customer that a payment of theirs did not go through, with where their plan stands and a link to pay. Call it once, when
 * the failed payment was recorded for the first time: recordFailedPayment is keyed on the provider's payment id, so a retried delivery
 * records nothing and the caller sends nothing. Skipped when the owner turned billing emails off for this business (the receipt,
 * a tax document, is not). Best-effort: it never throws.
 */
export async function sendPaymentFailed(db: Database, deps: PaymentEmailDeps, input: FailedPaymentEmail, now: Date = new Date()): Promise<void> {
  try {
    const details = await findBusinessAlertDetails(db, input.businessId);
    const to = details === null ? null : recipientOf(details.owner);
    if (details === null || to === null) return;
    const allowed =
      details.owner.userId === null ||
      (await emailPreferenceAllows(db, details.owner.userId, input.businessId, "billing", (error) =>
        console.error("[payment-email] Could not read the email preference, sending anyway.", { businessId: input.businessId, error: error instanceof Error ? error.name : "error" }),
      ));
    if (!allowed) return;
    const [items, plan] = await Promise.all([
      failedPaymentItems(db, input),
      input.chargeDescription === null ? planAfterFailure(db, input.businessId, now) : Promise.resolve(null),
    ]);
    await deps.send(
      paymentFailedEmail({
        to,
        name: details.owner.name,
        currency: input.currency,
        amountCents: input.amountCents,
        items,
        plan,
        payUrl: new URL(BILLING_PATH, deps.dashboardOrigin).toString(),
      }),
    );
  } catch (error) {
    console.error("[payment-email] A failed-payment email could not be sent.", { businessId: input.businessId, error: error instanceof Error ? error.name : "error" });
  }
}
