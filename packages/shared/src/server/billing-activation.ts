import "server-only";
import { addMonthsUtc, chargedAmountCents } from "@brandbasket/billing";
import {
  activateBundledAddOns,
  bundledNetCents,
  findBundledAddOnsForSubscription,
  openMembershipForListingBusiness,
  recordPaymentAndActivate,
  type BillingCurrency,
  type BillingProviderName,
  type BundledAddOn,
  type ManualPaymentRecord,
  type OpenedMembership,
  type PaymentMethodDetails,
  type Plan,
  type RecordedActivation,
  type ScopedTransaction,
} from "@brandbasket/db";
import { accrueAffiliateEarning } from "./affiliate-accrual";
import { issueTaxInvoiceSafely, type BundledInvoiceAddOn } from "./tax-invoicing";

export interface FirstPayment {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** The plan the subscription was opened on. Its term and price decide everything below. */
  readonly plan: Plan;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly paidAt: Date;
  /**
   * What a referral code took off this subscription's first payment, in the plan's minor units, as frozen on the
   * subscription. Defaults to 0. The payment is recorded at the lines' total minus this, because the
   * payments table must say what was actually taken, not what the lines list.
   */
  readonly discountAmountCents?: number;
  /** The audit trail, for a payment an admin recorded by hand (provider `manual`). */
  readonly manual?: ManualPaymentRecord;
  /** How the customer paid, when the provider said. */
  readonly method?: PaymentMethodDetails | null;
}

export interface FirstPaymentActivation extends RecordedActivation {
  /**
   * Set when this payment bought the Premium membership from a free listing account: the business has just become a
   * website client, in this transaction. Once it commits, the caller gives it the Payload tenant every client has
   * (syncTenantForBusiness). Null for a business that was already a client, and for a payment already recorded.
   */
  readonly openedMembership: OpenedMembership | null;
}

/**
 * The lines a first payment or a reactivation is for: `pending` until it is recorded, `active` once a first delivery
 * has turned them on. Counting both keeps a repeated delivery of the same payment (the webhook and the return page, or a
 * retry) at a real amount, which recordPaymentAndActivate then answers with the payment already recorded; with the
 * services plan costing nothing, the pending lines alone would come to 0 and refuse.
 */
async function billedLines(tx: ScopedTransaction, subscriptionId: string): Promise<readonly BundledAddOn[]> {
  return (await findBundledAddOnsForSubscription(tx, subscriptionId)).filter((row) => row.status !== "removed");
}

/**
 * The one activation path for a first payment, however it arrived (the provider's checkout or an admin recording a
 * bank transfer). It records what was charged (the services' nets, with the plan row's own initial amount if it has one,
 * less any referral discount, plus the plan's tax), opens the subscription until
 * `plan.initialTermMonths` calendar months after payment (the paid-up-front term is also the commitment), and marks
 * the lead paid, all inside the caller's staff transaction. Idempotent on the provider payment id.
 *
 * A free listing account pays before it has a project (docs/superpowers/specs/2026-09-30-single-entry-premium-
 * design.md), so its first payment also makes it a website client and opens its setup, in the same transaction.
 *
 * The term is unaffected by a discount: a referral code lowers the price, never the length of what it buys.
 *
 * A payment on an affiliate code also writes what the affiliate earned from it, in the same transaction.
 * Issues the payment's tax invoice last, in a savepoint (D7), a line for each service as it was billed.
 */
export async function activateFirstPayment(tx: ScopedTransaction, payment: FirstPayment): Promise<FirstPaymentActivation> {
  const termEnd = addMonthsUtc(payment.paidAt, payment.plan.initialTermMonths);
  // What was actually taken: net price less discount, with the plan's tax on top. chargedAmountCents throws for a
  // discount that would leave nothing, so a nonsense figure is never recorded as a payment.
  // The services taken at this checkout are lines of the subscription, billed in the same charge: their nets (the plan row
  // itself costs nothing), less the discount.
  const bundled = await billedLines(tx, payment.subscriptionId);
  const amountCents = chargedAmountCents(
    payment.plan.initialAmountCents + bundledNetCents(bundled),
    payment.discountAmountCents ?? 0,
    payment.plan.taxRateBasisPoints,
  );
  const activation = await recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "initial",
    amountCents,
    currency: payment.plan.currency,
    paidAt: payment.paidAt,
    paidThroughAt: termEnd,
    commitmentEndsAt: termEnd,
    currentPeriodEnd: termEnd,
    ...(payment.manual === undefined ? {} : { manual: payment.manual }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (activation.alreadyRecorded) return { ...activation, openedMembership: null };
  const activeBundle = await activateBundledAddOns(tx, { subscriptionId: payment.subscriptionId, now: payment.paidAt });
  await accrueAffiliateEarning(tx, { paymentId: activation.payment.id, subscriptionId: payment.subscriptionId, kind: "initial" });
  const openedMembership = await openMembershipForListingBusiness(tx, payment.businessId);
  // The last write that takes a lock outside this business's own rows: the invoice's serial holds the year's series row
  // until this transaction commits. Callers still run completePlanUpgradeAtRenewal and sendAfterPayment after it, but those
  // touch only this business's rows, which no other payment transaction can hold under the billing lock.
  await issueTaxInvoiceSafely(tx, activation.payment, {
    kind: "plan",
    plan: payment.plan,
    bundledAddOns: activeBundle,
    netAmountCents: payment.plan.initialAmountCents,
    discountAmountCents: payment.discountAmountCents ?? 0,
    // A stay offer is only ever added to a live subscription, never to its first payment.
    retentionDiscountCents: 0,
    monthly: payment.plan.initialTermMonths === 1,
    periodStart: payment.paidAt,
    periodEnd: termEnd,
  });
  return { ...activation, openedMembership };
}

/** What a renewal was charged at, exactly as the caller's amount check accepted it, for its tax invoice. */
export interface RenewalInvoicedPrice {
  readonly plan: Plan;
  /** The services billed inside the plan's charge, each a line of the invoice. Empty only for a subscription from before services were lines. */
  readonly bundledAddOns?: readonly BundledInvoiceAddOn[];
  /** The plan's recurring price before any discount. */
  readonly netAmountCents: number;
  /** Everything taken off: the referral code's share plus any stay offer. */
  readonly discountAmountCents: number;
  /** The stay offer's part of `discountAmountCents`, or 0. */
  readonly retentionDiscountCents: number;
}

export interface RenewalPayment {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** The subscription's existing commitment end, carried through unchanged: a renewal never moves it. */
  readonly commitmentEndsAt: Date;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  /** The end of the period this charge paid for. For Razorpay this is the webhook's own `current_end`, not
   * something we compute, because Razorpay is the authority on its own billing cycle boundaries. */
  readonly paidThroughAt: Date;
  /** The first instant this charge paid for: the provider's own cycle start (Razorpay's `current_start`), or `paidAt`. */
  readonly periodStart: Date;
  readonly invoicedPrice: RenewalInvoicedPrice;
  readonly providerStatus?: string | null;
  /** How the customer paid, when the provider said. */
  readonly method?: PaymentMethodDetails | null;
}

/**
 * Records a renewal (a charge after the first one) against an already-open subscription. Unlike
 * `activateFirstPayment`, the period this buys comes from the provider rather than being computed from the plan's
 * term, and the commitment date is passed through unchanged rather than recalculated — recordPaymentAndActivate
 * overwrites both dates unconditionally, so both must be supplied correctly by the caller every time. A renewal on an
 * affiliate code earns the affiliate another month, in the same transaction. Issues the payment's tax invoice last, in a
 * savepoint (D7).
 */
export async function activateRenewalPayment(tx: ScopedTransaction, payment: RenewalPayment): Promise<RecordedActivation> {
  const activation = await recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "renewal",
    amountCents: payment.amountCents,
    currency: payment.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.commitmentEndsAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.providerStatus === undefined ? {} : { providerStatus: payment.providerStatus }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (!activation.alreadyRecorded) {
    await accrueAffiliateEarning(tx, { paymentId: activation.payment.id, subscriptionId: payment.subscriptionId, kind: "renewal" });
    await issueTaxInvoiceSafely(tx, activation.payment, {
      kind: "plan",
      ...payment.invoicedPrice,
      monthly: true,
      periodStart: payment.periodStart,
      periodEnd: payment.paidThroughAt,
    });
  }
  return activation;
}

export interface ReactivationPayment {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** The plan on sale for the business's tier when it reactivated: today's price, never the one it lapsed on. */
  readonly plan: Plan;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly paidAt: Date;
  /** The end of the month this payment buys: Razorpay's cycle end, or one calendar month for a manual or test payment. */
  readonly paidThroughAt: Date;
  /** The audit trail, for a payment an admin recorded by hand (provider `manual`). */
  readonly manual?: ManualPaymentRecord;
  /** How the customer paid, when the provider said. */
  readonly method?: PaymentMethodDetails | null;
}

/**
 * The first payment on a new subscription for a business that paid before and lapsed (docs/superpowers/specs/2026-10-09-
 * reactivation-design.md). Missed months are not charged: it buys one month from the day it is paid, at the plan's
 * monthly price (0 for a services plan) plus the services its checkout was opened with, with its tax and no coupon. It is not a first payment: no
 * lead is marked paid, no membership opens (the business is already a client) and no affiliate earns on it. Idempotent on
 * the provider payment id. Issues the payment's tax invoice last, in a savepoint (D7).
 */
export async function activateReactivationPayment(tx: ScopedTransaction, payment: ReactivationPayment): Promise<RecordedActivation> {
  const bundled = await billedLines(tx, payment.subscriptionId);
  const activation = await recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "reactivation",
    amountCents: chargedAmountCents(payment.plan.recurringAmountCents + bundledNetCents(bundled), 0, payment.plan.taxRateBasisPoints),
    currency: payment.plan.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.paidThroughAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.manual === undefined ? {} : { manual: payment.manual }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (!activation.alreadyRecorded) {
    const activeBundle = await activateBundledAddOns(tx, { subscriptionId: payment.subscriptionId, now: payment.paidAt });
    await issueTaxInvoiceSafely(tx, activation.payment, {
      kind: "plan",
      plan: payment.plan,
      bundledAddOns: activeBundle,
      netAmountCents: payment.plan.recurringAmountCents,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: payment.paidAt,
      periodEnd: payment.paidThroughAt,
    });
  }
  return activation;
}
