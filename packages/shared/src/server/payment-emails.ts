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
import { emailDate, emailOutcome, firstChargeReminderEmail, paymentFailedEmail, paymentReceivedEmail, paymentRefundedEmail, type EmailAttachment, type EmailMessage, type EmailSendOutcome, type PaymentFailedPlan } from "@brandbasket/email";
import { nextBundledNetCents, nextDiscountCents } from "../lib/billing/bundle";
import { nextPaymentDate } from "../lib/billing/period";
import { paymentsContinue } from "../lib/billing/payments-continue";
import { receiptDownloadHref } from "../lib/billing/receipt-download";
import { renewalChargeCents } from "../lib/billing/terms";
import { emailPreferenceAllows } from "./email-preference";
import { notifyEvent } from "./notify-event";
import { paymentServiceNames, serviceTitle } from "./payment-alerts";
import { renderTaxInvoicesPdf } from "./tax-invoice-pdf";

/** Where the customer pays: the payment and details step on the dashboard. */
const PAY_STEP_PATH = "/billing/payment";
const BILLING_PATH = "/billing";
const RECEIPT_TEMPLATE = "payment-received";
const BASIS_POINTS_PER_PERCENT = 100;
/** Payments of these kinds pay for a stretch of the plan, so the email can say what it is paid up to. */
const PLAN_PAYMENT_KINDS: ReadonlySet<Payment["kind"]> = new Set(["initial", "renewal", "reactivation"]);

export interface PaymentEmailDeps {
  /** Delivers one message: the app's customer transport. Called only when there is someone to write to. */
  readonly send: (message: EmailMessage) => Promise<EmailSendOutcome | void>;
  /** The dashboard's origin, for the links in the email. */
  readonly dashboardOrigin: string;
  /**
   * The PDF to attach when a payment has no tax invoice (a payment in dollars): its receipt. Null when it cannot be made.
   * Left out, such an email goes with the receipt link alone.
   */
  readonly renderReceiptPdf?: (payment: Pick<Payment, "id" | "businessId">) => Promise<EmailAttachment | null>;
  /**
   * For a customer who paid first (plan 64): a link to set their first password and how many days it works, or null when the
   * account already has a password. Asked only once the dedupe check has passed, so no link is made for a send that is skipped.
   */
  readonly setPassword?: (email: string) => Promise<{ readonly url: string; readonly lifetimeDays: number } | null>;
}

/** The tax invoice as the PDF that goes with the email, named as the dashboard's download names it. */
async function invoiceAttachment(invoice: TaxInvoice): Promise<EmailAttachment> {
  return { name: `brandbasket-invoice-${invoice.number.replaceAll("/", "-")}.pdf`, content: await renderTaxInvoicesPdf([invoice]) };
}

/**
 * The PDF for a receipt email: the tax invoice when there is one, else the receipt. Never throws and never blocks the email: a PDF that
 * cannot be made leaves the receipt link, which the email always carries.
 */
async function paymentPdf(deps: PaymentEmailDeps, payment: Payment, invoice: TaxInvoice | null): Promise<EmailAttachment | null> {
  try {
    return invoice !== null ? await invoiceAttachment(invoice) : ((await deps.renderReceiptPdf?.(payment)) ?? null);
  } catch (error) {
    console.error("[payment-email] A payment PDF could not be made, so the email goes without it.", { paymentId: payment.id, error: error instanceof Error ? error.name : "error" });
    return null;
  }
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
 * Every receipt carries its PDF (the tax invoice, else the receipt). The first payment of a customer who paid before choosing a
 * password also carries the link to set one (deps.setPassword, plan 64); the stored copy leaves that link out.
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
    if (payment.status !== "captured") return;
    if (isUnappliedReason(payment.attentionReason)) {
      // No receipt for money that bought nothing. The owner is told it arrived and is being looked at; staff get a push.
      await notifyEvent(db, { event: "billing.unapplied_payment", audience: { kind: "customer", businessId: payment.businessId }, dedupeKey: payment.id, data: {} });
      await notifyEvent(db, { event: "billing.payment_needs_look.staff", audience: { kind: "staff", businessId: payment.businessId }, dedupeKey: payment.id, data: {} });
      return;
    }
    // The bell and push come from notify() (its dedupe key is the payment); the receipt email below is the old sender, kept.
    await notifyEvent(db, { event: "billing.payment_received", audience: { kind: "customer", businessId: payment.businessId }, dedupeKey: payment.id, data: {} });
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
    const [pdf, setPassword] = await Promise.all([paymentPdf(deps, payment, invoice), deps.setPassword?.(to) ?? Promise.resolve(null)]);
    const build = (attach: EmailAttachment | null): EmailMessage => {
      const email = paymentReceivedEmail({
        to,
        name: owner.name,
        currency: payment.currency,
        amountCents: payment.amountCents,
        items,
        gstRatePercent: gstRatePercent(payment.currency, invoice),
        paidThrough: period.paidThrough,
        nextPayment: period.nextPayment,
        receiptUrl,
        ...(setPassword === null ? {} : { setPassword }),
        ...(attach === null ? {} : { pdfAttached: true }),
      });
      return attach === null ? email : { ...email, attachments: [attach] };
    };
    const outcome = emailOutcome(await deps.send(build(pdf)));
    // A provider that refuses the file (a failure no retry would cure) must not cost the customer the receipt and the link to set a
    // password: the same email goes again without it, saying nothing about an attachment.
    if (outcome.status === "failed" && pdf !== null) await deps.send(build(null));
  } catch (error) {
    console.error("[payment-email] A payment receipt could not be sent.", { paymentId, error: error instanceof Error ? error.name : "error" });
  }
}

export interface FailedPaymentEmail {
  readonly businessId: string;
  /** The provider's payment id: what makes a retried delivery the same notice. */
  readonly providerPaymentId: string;
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
 * records nothing and the caller sends nothing. Always sent: no email preference is read. Best-effort: it never throws.
 */
export async function sendPaymentFailed(db: Database, deps: PaymentEmailDeps, input: FailedPaymentEmail, now: Date = new Date()): Promise<void> {
  try {
    // Mandatory since the owner's answer of 2026-11-16: the bell and push always go, and so does the email (no preference is read).
    await notifyEvent(db, { event: "billing.payment_failed", audience: { kind: "customer", businessId: input.businessId }, dedupeKey: input.providerPaymentId, data: {} });
    const details = await findBusinessAlertDetails(db, input.businessId);
    const to = details === null ? null : recipientOf(details.owner);
    if (details === null || to === null) return;
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
        payUrl: new URL(PAY_STEP_PATH, deps.dashboardOrigin).toString(),
      }),
    );
  } catch (error) {
    console.error("[payment-email] A failed-payment email could not be sent.", { businessId: input.businessId, error: error instanceof Error ? error.name : "error" });
  }
}

export interface FirstChargeReminderEmail {
  readonly businessId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly chargeDate: Date;
}

const FIRST_CHARGE_REMINDER_TEMPLATE = "first-charge-reminder";

/**
 * Sends a reminder email before the first full-price charge after an introductory offer period (e.g. ₹1 first month).
 * Contains the charge date and amount.
 * Idempotent: checks hasEmailContaining with template "first-charge-reminder" and toAddress so it is sent only once.
 */
export async function sendFirstChargeReminder(
  db: Database,
  deps: PaymentEmailDeps,
  input: FirstChargeReminderEmail,
  now: Date = new Date(),
): Promise<void> {
  try {
    // The bell comes from notify() (once per charge date); the email below is the existing template, kept.
    await notifyEvent(db, {
      event: "billing.renewal_upcoming",
      audience: { kind: "customer", businessId: input.businessId },
      dedupeKey: `${input.businessId}:${input.chargeDate.toISOString()}`,
      data: { when: emailDate(input.chargeDate) },
    });
    const details = await findBusinessAlertDetails(db, input.businessId);
    const to = details === null ? null : recipientOf(details.owner);
    if (details === null || to === null) return;

    const allowed =
      details.owner.userId === null ||
      (await emailPreferenceAllows(db, details.owner.userId, input.businessId, "billing", (error) =>
        console.error("[payment-email] Could not read the email preference, sending anyway.", {
          businessId: input.businessId,
          error: error instanceof Error ? error.name : "error",
        }),
      ));
    if (!allowed) return;

    const billingUrl = new URL(PAY_STEP_PATH, deps.dashboardOrigin).toString();
    const subscription = await findLatestSubscriptionForBusiness(db, input.businessId);
    const since = subscription?.createdAt ?? new Date(0);

    const alreadySent = await hasEmailContaining(db, {
      template: FIRST_CHARGE_REMINDER_TEMPLATE,
      toAddress: to,
      text: billingUrl,
      since,
    });
    if (alreadySent) return;

    const items =
      subscription === null
        ? []
        : (await findBundledAddOnsForSubscription(db, subscription.id))
            .filter((line) => line.status !== "removed")
            .map((line) => serviceTitle(line.addOn));

    await deps.send(
      firstChargeReminderEmail({
        to,
        name: details.owner.name,
        currency: input.currency,
        amountCents: input.amountCents,
        chargeDate: input.chargeDate,
        items,
        billingUrl,
        businessId: input.businessId,
      }),
    );
  } catch (error) {
    console.error("[payment-email] A first-charge reminder could not be sent.", {
      businessId: input.businessId,
      error: error instanceof Error ? error.name : "error",
    });
  }
}

export interface RefundEmailInput {
  readonly paymentId: string;
  readonly refundedAmountCents: number;
  readonly reason: string;
  readonly creditNoteNumber: string | null;
}

const REFUND_TEMPLATE = "payment-refunded";

/**
 * Emails the customer that their payment was refunded, with the credit note number if issued.
 * Idempotent: checks outbox so duplicate sends for the same payment are skipped.
 */
export async function sendPaymentRefunded(
  db: Database,
  deps: PaymentEmailDeps,
  input: RefundEmailInput,
  now: Date = new Date(),
): Promise<void> {
  try {
    const base = await findPaymentAlertBase(db, input.paymentId);
    if (base === null) return;
    const { payment, owner } = base;
    // One notice per refund: the credit note when there is one, else the payment and the amount (a payment can be refunded in parts).
    await notifyEvent(db, {
      event: "billing.refund",
      audience: { kind: "customer", businessId: payment.businessId },
      dedupeKey: input.creditNoteNumber ?? `${payment.id}:${input.refundedAmountCents}`,
      data: {},
    });
    const to = recipientOf(owner);
    if (to === null) return;
    const billingUrl = new URL(BILLING_PATH, deps.dashboardOrigin).toString();

    const alreadySent = await hasEmailContaining(db, {
      template: REFUND_TEMPLATE,
      toAddress: to,
      text: input.creditNoteNumber ?? billingUrl,
      since: payment.createdAt,
    });

    if (alreadySent) return;

    const items = await paymentServiceNames(db, payment);
    await deps.send(
      paymentRefundedEmail({
        to,
        name: owner.name,
        currency: payment.currency,
        refundedAmountCents: input.refundedAmountCents,
        originalAmountCents: payment.amountCents,
        items,
        reason: input.reason,
        creditNoteNumber: input.creditNoteNumber,
        billingUrl,
      }),
    );
  } catch (error) {
    console.error("[payment-email] A refund email could not be sent.", {
      paymentId: input.paymentId,
      error: error instanceof Error ? error.name : "error",
    });
  }
}
