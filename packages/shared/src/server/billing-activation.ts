import "server-only";
import { addMonthsUtc, chargedAmountCents } from "@brandbasket/billing";
import {
  activateBundledAddOns,
  bundledNetCents,
  findBundledAddOnsForSubscription,
  openMembershipForListingBusiness,
  findSubscriptionById,
  recordPaymentAndActivate,
  settleDiscountAfterPayment,
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

/**
 * What a payment did to its code's discount, for the caller to act on once the transaction has committed: when this payment
 * was the last of the discount's months, the provider is still billing the discounted amount and must be moved to the one
 * without it (moveProviderAfterDiscountEnds in basket-change.ts).
 */
export interface DiscountEffect {
  readonly discountEnded: boolean;
}

export interface FirstPaymentActivation extends RecordedActivation, DiscountEffect {
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
 * bank transfer). It records what was charged (the services' prices, GST included, with the plan row's own initial
 * amount if it has one, less any referral discount), opens the subscription until
 * `plan.initialTermMonths` calendar months after payment (the paid-up-front term is also the commitment), and marks
 * the lead paid, all inside the caller's staff transaction. Idempotent on the provider payment id.
 *
 * A free listing account pays before it has a project (docs/superpowers/specs/2026-09-30-single-entry-premium-
 * design.md), so its first payment also makes it a website client and, when the basket holds the Managed Website
 * service, opens its setup, in the same transaction.
 *
 * The term is unaffected by a discount: a referral code lowers the price, never the length of what it buys.
 *
 * A payment taken with a code discount counts one of the code's paid months (settleDiscountAfterPayment); the result says when it
 * was the last, for the caller to move the provider once the transaction has committed.
 *
 * A payment on an affiliate code also writes what the affiliate earned from it, in the same transaction.
 * Issues the payment's tax invoice last, in a savepoint (D7), a line for each service as it was billed.
 */
export async function activateFirstPayment(tx: ScopedTransaction, payment: FirstPayment): Promise<FirstPaymentActivation> {
  const termEnd = addMonthsUtc(payment.paidAt, payment.plan.initialTermMonths);
  // What was actually taken: the price (GST included) less the discount. chargedAmountCents throws for a discount that
  // would leave nothing, so a nonsense figure is never recorded as a payment.
  // The services taken at this checkout are lines of the subscription, billed in the same charge: their prices (the plan
  // row itself costs nothing), less the discount.
  const bundled = await billedLines(tx, payment.subscriptionId);
  const amountCents = chargedAmountCents(
    payment.plan.initialAmountCents + bundledNetCents(bundled),
    payment.discountAmountCents ?? 0,
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
  if (activation.alreadyRecorded) return { ...activation, openedMembership: null, discountEnded: false };
  const activeBundle = await activateBundledAddOns(tx, { subscriptionId: payment.subscriptionId, now: payment.paidAt });
  const settlement = await settleDiscountAfterPayment(tx, {
    subscriptionId: payment.subscriptionId,
    discountTakenCents: payment.discountAmountCents ?? 0,
    adoptsNewDiscount: false,
    now: payment.paidAt,
  });
  await accrueAffiliateEarning(tx, { paymentId: activation.payment.id, subscriptionId: payment.subscriptionId, kind: "initial" });
  const openedMembership = await openMembershipForListingBusiness(tx, payment.businessId, {
    withProject: activeBundle.some((line) => line.addOn === "managed-website"),
  });
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
  return { ...activation, openedMembership, discountEnded: settlement.ended };
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
  /**
   * The renewal was taken at the discount that was waiting for it (the months ran out, or a basket change repriced the code),
   * not the one the subscription held: that discount is now the subscription's own.
   */
  readonly atNewDiscount?: boolean;
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
export async function activateRenewalPayment(tx: ScopedTransaction, payment: RenewalPayment): Promise<RecordedActivation & DiscountEffect> {
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
  if (activation.alreadyRecorded) return { ...activation, discountEnded: false };
  // The subscription still holds the amount it was billed before this payment when the renewal completes a change, so
  // the earning is worked out on what the renewal was invoiced at.
  const { bundledAddOns, netAmountCents, discountAmountCents, retentionDiscountCents } = payment.invoicedPrice;
  const settlement = await settleDiscountAfterPayment(tx, {
    subscriptionId: payment.subscriptionId,
    discountTakenCents: discountAmountCents - retentionDiscountCents,
    adoptsNewDiscount: payment.atNewDiscount === true,
    now: payment.paidAt,
  });
  await accrueAffiliateEarning(tx, {
    paymentId: activation.payment.id,
    subscriptionId: payment.subscriptionId,
    kind: "renewal",
    ...(bundledAddOns === undefined
      ? {}
      : {
          invoiced: {
            netCents: netAmountCents + bundledAddOns.reduce((total, line) => total + line.listAmountCents - line.offerDiscountAmountCents, 0),
            discountCents: discountAmountCents,
          },
        }),
  });
  await issueTaxInvoiceSafely(tx, activation.payment, {
    kind: "plan",
    ...payment.invoicedPrice,
    monthly: true,
    periodStart: payment.periodStart,
    periodEnd: payment.paidThroughAt,
  });
  return { ...activation, discountEnded: settlement.ended };
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
 * monthly price (0 for a services plan) plus the services its checkout was opened with, with its tax. A lapse (not the client's own
 * cancel) carries its code onto the new subscription with the months it had left (openPlanCheckout), so the payment is taken
 * less that frozen discount, counts one of those months, and earns the code's affiliate as a renewal does. It is not a first payment: no
 * lead is marked paid and no membership opens (the business is already a client). Idempotent on
 * the provider payment id. Issues the payment's tax invoice last, in a savepoint (D7).
 */
export async function activateReactivationPayment(tx: ScopedTransaction, payment: ReactivationPayment): Promise<RecordedActivation & DiscountEffect> {
  const bundled = await billedLines(tx, payment.subscriptionId);
  // The code a lapse carried onto this subscription (openPlanCheckout), repriced on its basket and frozen when the checkout
  // opened: 0 for a client who cancelled themselves or whose code had run its months out.
  // (recordPaymentAndActivate below refuses a subscription that is not this business's.)
  const subscription = await findSubscriptionById(tx, payment.subscriptionId);
  if (subscription === null) throw new Error(`Subscription ${payment.subscriptionId} was not found to reactivate`);
  const discountCents = subscription.discountAmountCents;
  const activation = await recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "reactivation",
    amountCents: chargedAmountCents(payment.plan.recurringAmountCents + bundledNetCents(bundled), discountCents),
    currency: payment.plan.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.paidThroughAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.manual === undefined ? {} : { manual: payment.manual }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (activation.alreadyRecorded) return { ...activation, discountEnded: false };
  const activeBundle = await activateBundledAddOns(tx, { subscriptionId: payment.subscriptionId, now: payment.paidAt });
  const settlement = await settleDiscountAfterPayment(tx, { subscriptionId: payment.subscriptionId, discountTakenCents: discountCents, adoptsNewDiscount: false, now: payment.paidAt });
  await accrueAffiliateEarning(tx, { paymentId: activation.payment.id, subscriptionId: payment.subscriptionId, kind: "reactivation" });
  await issueTaxInvoiceSafely(tx, activation.payment, {
    kind: "plan",
    plan: payment.plan,
    bundledAddOns: activeBundle,
    netAmountCents: payment.plan.recurringAmountCents,
    discountAmountCents: discountCents,
    retentionDiscountCents: 0,
    monthly: true,
    periodStart: payment.paidAt,
    periodEnd: payment.paidThroughAt,
  });
  return { ...activation, discountEnded: settlement.ended };
}
