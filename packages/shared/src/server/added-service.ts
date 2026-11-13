import "server-only";
import { chargedAmountCents } from "@brandbasket/billing";
import {
  activateBundledAddOns,
  businessHasHadService,
  findWaitingAddedServiceSuccessor,
  lockBusinessForBilling,
  openAddedServiceSuccessor,
  findBundledAddOnsForSubscription,
  findPlanById,
  findSubscriptionById,
  markReplacedBySuccessor,
  recordAddedServiceCharge,
  recordPaymentAndActivate,
  recordUnappliedPayment,
  startBundledTrials,
  type BillingCurrency,
  type BillingProviderName,
  type BundledAddOn,
  type Database,
  type NewBundledAddOn,
  type PaymentMethodDetails,
  type Plan,
  type ScopedTransaction,
  type Subscription,
  type UnappliedPaymentReason,
} from "@brandbasket/db";
import { planAddedService } from "../lib/billing/added-service";
import { addOnById, isMonthlyAddOnId, MONITORING_ID, monitoringIncludedWith, type MonthlyAddOnId } from "../lib/billing/add-ons";
import { nextBundledNetCents, nextDiscountCents } from "../lib/billing/bundle";
import { discountOnBasket, readAddOnAssessment, type AddOnAssessment, type BasketDeps } from "./basket-change";
import { describeError, logBillingEvent } from "./billing-log";
import { cancelAtProvider } from "./provider-cancellation";
import { issueTaxInvoiceSafely, servicePeriod } from "./tax-invoicing";

/*
 * The upfront payment of a combined subscription (plan 63, Option Y): a service added after sign-up is paid with a new subscription
 * for every service, which starts on the new billing date, and what falls before that is taken when the customer approves it. When
 * that payment is recorded the combined subscription becomes the business's own at once: its services, the new one included, are
 * live, it is paid up to the new billing date, and the subscription it replaces ends its lines and is cancelled at the provider at
 * the end of the month it is paid for. One path for every way the payment arrives (the webhook, the check that asks the provider,
 * the local confirm page).
 */

export interface AddedServicePayment {
  /** Our id of the combined subscription. */
  readonly subscriptionId: string;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
  readonly method?: PaymentMethodDetails | null;
}

export type AddedServiceRecorded =
  | {
      readonly kind: "recorded";
      readonly businessId: string;
      readonly paymentId: string;
      /** The subscription it replaced, to cancel at the provider at the end of its paid month once this has committed. */
      readonly replaced: { readonly provider: BillingProviderName; readonly providerSubscriptionId: string; readonly subscriptionId: string } | null;
    }
  | { readonly kind: "already-recorded" }
  | { readonly kind: "unapplied"; readonly businessId: string; readonly paymentId: string; readonly newlyRecorded: boolean; readonly reason: UnappliedPaymentReason };

/** What a combined subscription replaces, and the service it adds, while it still fits. */
export interface CombinedFit {
  readonly replaced: Subscription;
  readonly added: BundledAddOn;
}

/**
 * Whether a combined subscription still fits the subscription it replaces, read under the caller's lock or for a page: that one has not
 * renewed past the new billing date, is not closing, has no plan change or stopping service waiting, and still bills exactly the
 * services the combined one carries less the one added (monitoring aside, once all three include it). Anything else would take a
 * month twice or bring back a service the customer stopped, so a combined subscription that no longer fits can no longer be paid.
 */
export async function combinedStillFits(db: Database | ScopedTransaction, successor: Subscription): Promise<CombinedFit | null> {
  if (successor.continuesId === null || successor.firstPaymentCents === null || successor.firstChargeAt === null || successor.status === "cancelled") return null;
  const replaced = await findSubscriptionById(db, successor.continuesId);
  if (
    replaced === null ||
    replaced.businessId !== successor.businessId ||
    replaced.status === "cancelled" ||
    replaced.cancelRequestedAt !== null ||
    replaced.pendingPlanId !== null ||
    replaced.paidThroughAt === null ||
    replaced.paidThroughAt.getTime() > successor.firstChargeAt.getTime()
  ) {
    return null;
  }
  const carried = await findBundledAddOnsForSubscription(db, successor.id);
  const live = (await findBundledAddOnsForSubscription(db, replaced.id)).filter((row) => row.status === "active");
  if (live.some((row) => row.endRequestedAt !== null)) return null;
  const carries = (addOn: string): boolean => carried.some((row) => row.addOn === addOn);
  const monitoringIncluded = monitoringIncludedWith(carried.map((row) => row.addOn).filter(isMonthlyAddOnId));
  const staying = live.filter((row) => !(row.addOn === MONITORING_ID && monitoringIncluded && !carries(MONITORING_ID)));
  if (!staying.every((row) => carries(row.addOn))) return null;
  const added = carried.filter((row) => !staying.some((kept) => kept.addOn === row.addOn));
  const [only] = added;
  return added.length === 1 && only !== undefined ? { replaced, added: only } : null;
}

/** What the upfront payment's tax invoice line says it is for: the added service to the new billing date, and the plan's extra days. */
function upfrontDescription(fit: CombinedFit, paidAt: Date, newBillingDate: Date): string {
  const title = isMonthlyAddOnId(fit.added.addOn) ? addOnById(fit.added.addOn).title : fit.added.addOn;
  const service = fit.added.trialPriceCents === null ? `${title}, ${servicePeriod(paidAt, newBillingDate)}` : `${title} first month offer, ${servicePeriod(paidAt, newBillingDate)}`;
  const paidThrough = fit.replaced.paidThroughAt;
  return paidThrough !== null && paidThrough.getTime() < newBillingDate.getTime() ? `${service}, and your plan ${servicePeriod(paidThrough, newBillingDate)}` : service;
}

/**
 * Records the upfront payment of a combined subscription and makes it the business's own. The caller holds the business's billing
 * lock. Idempotent on the provider payment id. Money for a combined subscription that was replaced, that no longer fits what it
 * replaces (combinedStillFits), or of another amount than the one frozen when it opened, is kept for staff and activates nothing.
 */
export async function recordAddedServicePayment(tx: ScopedTransaction, payment: AddedServicePayment): Promise<AddedServiceRecorded> {
  const successor = await findSubscriptionById(tx, payment.subscriptionId);
  if (successor === null || successor.continuesId === null || successor.firstPaymentCents === null || successor.firstChargeAt === null) {
    throw new Error(`Subscription ${payment.subscriptionId} is not a combined subscription for an added service`);
  }
  if (successor.activatedAt !== null) return { kind: "already-recorded" };

  const unapplied = async (reason: UnappliedPaymentReason): Promise<AddedServiceRecorded> => {
    const recorded = await recordUnappliedPayment(tx, {
      businessId: successor.businessId,
      subscriptionId: successor.id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      kind: "add_on",
      amountCents: payment.amountCents,
      currency: payment.currency,
      paidAt: payment.paidAt,
      reason,
      now: payment.paidAt,
      ...(payment.method === undefined ? {} : { method: payment.method }),
    });
    return { kind: "unapplied", businessId: successor.businessId, paymentId: recorded.payment.id, newlyRecorded: !recorded.alreadyRecorded, reason };
  };

  if (successor.status === "cancelled") return unapplied("checkout_replaced");
  const plan = await findPlanById(tx, successor.planId);
  if (plan === null || plan.currency !== payment.currency || payment.amountCents !== successor.firstPaymentCents) return unapplied("amount_mismatch");
  const fit = await combinedStillFits(tx, successor);
  if (fit === null) return unapplied("checkout_replaced");
  const { replaced, added } = fit;
  const newBillingDate = successor.firstChargeAt;

  const activation = await recordPaymentAndActivate(tx, {
    businessId: successor.businessId,
    subscriptionId: successor.id,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "add_on",
    amountCents: payment.amountCents,
    currency: payment.currency,
    paidAt: payment.paidAt,
    // The upfront amount pays everything up to the new billing date, when the combined subscription's first full charge falls.
    paidThroughAt: newBillingDate,
    commitmentEndsAt: replaced.commitmentEndsAt ?? newBillingDate,
    currentPeriodEnd: newBillingDate,
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
  if (activation.alreadyRecorded) return { kind: "already-recorded" };

  await activateBundledAddOns(tx, { subscriptionId: successor.id, now: payment.paidAt });
  // A service on the first-month offer runs free until the combined subscription's first full charge.
  await startBundledTrials(tx, { subscriptionId: successor.id, trialEndsAt: newBillingDate, now: payment.paidAt });
  const chargeId = await recordAddedServiceCharge(tx, {
    businessId: successor.businessId,
    bundledAddOnId: added.id,
    description: upfrontDescription(fit, payment.paidAt, newBillingDate),
    amountCents: payment.amountCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    currency: payment.currency,
    paymentId: activation.payment.id,
    paidAt: payment.paidAt,
  });
  await markReplacedBySuccessor(tx, { subscriptionId: replaced.id, now: payment.paidAt });
  await issueTaxInvoiceSafely(tx, activation.payment, { kind: "charge", chargeId });
  return {
    kind: "recorded",
    businessId: successor.businessId,
    paymentId: activation.payment.id,
    replaced:
      replaced.status === "cancelled"
        ? null
        : { provider: replaced.provider, providerSubscriptionId: replaced.providerSubscriptionId, subscriptionId: replaced.id },
  };
}

/** What asking to add a service as a combined subscription came to. */
export type CombinedAddOnStart =
  /** Not a case for a combined subscription (a yearly plan, or keeping a service that is ending): the add takes the older path. */
  | { readonly kind: "not-combined" }
  /** The combined subscription is open: the customer approves it and pays the upfront amount at `checkoutUrl`. */
  | { readonly kind: "approve"; readonly subscriptionId: string; readonly providerSubscriptionId: string; readonly checkoutUrl: string }
  /** A service is set to stop, or a plan change is waiting, on `changesOn`: replacing the subscription now would undo it, so the add waits. */
  | { readonly kind: "change-pending"; readonly changesOn: Date }
  | { readonly kind: "refused"; readonly assessment: AddOnAssessment }
  /** The earlier combined subscription's upfront payment exists at the provider but is not recorded yet: nothing was opened, so it is not replaced and paid twice. */
  | { readonly kind: "payment-pending" }
  /** The business changed while the provider was asked: nothing was opened. */
  | { readonly kind: "changed" };

export interface PlannedCombined {
  readonly subscription: Subscription;
  readonly plan: Plan;
  readonly lines: readonly NewBundledAddOn[];
  readonly netCents: number;
  readonly discountCents: number;
  /** Taken when the customer approves it: `serviceCents` for the added service and `extensionCents` for the plan's extra days. */
  readonly upfrontCents: number;
  readonly serviceCents: number;
  readonly extensionCents: number;
  /** The added service's first-month price on the offer, or null at its price. */
  readonly trialPriceCents: number | null;
  /** What every full charge takes from the new billing date, GST included. */
  readonly monthlyCents: number;
  readonly newBillingDate: Date;
  readonly replacing: Subscription | null;
}

/** Thrown inside the recording transaction to roll it back when what was planned no longer fits the business. */
class PlanNoLongerFits extends Error {}

/** Monthly subscriptions at a provider that charges a subscription itself: the only ones a combined subscription can replace. */
function combinable(subscription: Subscription): boolean {
  return subscription.billingInterval === "month" && (subscription.provider === "razorpay" || subscription.provider === "fake");
}

/** What adding a service as a combined subscription would come to, or why it cannot. */
export type CombinedAddOnPlan = { readonly kind: "planned"; readonly planned: PlannedCombined } | Exclude<CombinedAddOnStart, { kind: "approve" | "payment-pending" }>;

/**
 * Works out a combined subscription for an added service without opening anything: the lines, the new billing date and what is
 * paid upfront. startCombinedAddOn runs it under the business's billing lock; the Plan & billing page runs it to show the add.
 */
export async function planCombinedAddOn(
  tx: Database | ScopedTransaction,
  input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly providerName: BillingProviderName; readonly now: Date },
): Promise<CombinedAddOnPlan> {
  const assessment = await readAddOnAssessment(tx, { businessId: input.businessId, addOn: input.addOn, providerName: input.providerName, now: input.now });
  if (assessment === null) return { kind: "refused", assessment: { kind: "blocked", reason: "unpaid" } };
  if (assessment.kind === "keep") return { kind: "not-combined" };
  if (assessment.kind !== "offer") return { kind: "refused", assessment };
  const { subscription, plan, line } = assessment;
  if (!combinable(subscription)) return { kind: "not-combined" };
  if (subscription.paidThroughAt === null) return { kind: "refused", assessment: { kind: "blocked", reason: "unpaid" } };

  const live = (await findBundledAddOnsForSubscription(tx, subscription.id)).filter((row) => row.status === "active");
  if (subscription.pendingPlanId !== null || live.some((row) => row.endRequestedAt !== null)) return { kind: "change-pending", changesOn: subscription.paidThroughAt };
  // Monitoring is free with all three plans: a monitoring line being billed is not carried over once this add completes them.
  const monitoringIncluded = monitoringIncludedWith([...live.map((row) => row.addOn).filter(isMonthlyAddOnId), input.addOn]);
  const carried = live.filter((row) => !(monitoringIncluded && row.addOn === MONITORING_ID));
  const nextNetOf = (row: BundledAddOn): number => row.listAmountCents - (row.pendingOfferDiscountAmountCents ?? row.offerDiscountAmountCents);
  const monitoringDroppedCents = live.filter((row) => !carried.includes(row)).reduce((total, row) => total + nextNetOf(row), 0);

  const added = planAddedService({
    service: input.addOn,
    netCents: line.netCents,
    hadService: await businessHasHadService(tx, input.businessId, input.addOn),
    interval: subscription.billingInterval,
    provider: subscription.provider,
    currency: plan.currency,
    now: input.now,
    period: { start: assessment.periodStart, end: subscription.paidThroughAt },
    // The plan as it would renew, without a monitoring line the add makes free: the days up to the new billing date are taken at that.
    currentRenewalCents: chargedAmountCents(plan.recurringAmountCents + nextBundledNetCents(subscription) - monitoringDroppedCents, nextDiscountCents(subscription)),
  });
  if (added.kind === "refused") return { kind: "refused", assessment: { kind: "unavailable", reason: "renewal-due" } };

  // Every service the combined subscription bills, each at the price it takes from the new billing date.
  const staying: NewBundledAddOn[] = carried.map((row) => {
    const offer = row.pendingOfferDiscountAmountCents ?? row.offerDiscountAmountCents;
    return { addOn: row.addOn, listAmountCents: row.listAmountCents, offerDiscountAmountCents: offer, netAmountCents: nextNetOf(row), taxRateBasisPoints: row.taxRateBasisPoints };
  });
  const lines: NewBundledAddOn[] = [
    ...staying,
    {
      addOn: input.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: plan.taxRateBasisPoints,
      trialPriceCents: added.trialPriceCents,
    },
  ];
  const netCents = lines.reduce((total, row) => total + row.netAmountCents, 0);
  const discountCents = await discountOnBasket(tx, subscription, netCents);
  return {
    kind: "planned",
    planned: {
      subscription,
      plan,
      lines,
      netCents,
      discountCents,
      upfrontCents: added.upfrontCents,
      serviceCents: added.serviceCents,
      extensionCents: added.extensionCents,
      trialPriceCents: added.trialPriceCents,
      monthlyCents: chargedAmountCents(plan.recurringAmountCents + netCents, discountCents),
      newBillingDate: added.newBillingDate,
      replacing: await findWaitingAddedServiceSuccessor(tx, subscription.id),
    },
  };
}

/**
 * Adds a service after sign-up as one combined subscription (plan 63, Option Y). Under the business's billing lock it checks the add
 * as every add is checked (readAddOnAssessment) and works out the new billing date and the upfront amount (planAddedService); with no
 * lock held it makes the provider's plan and subscription; then, under the lock again and only if nothing moved, it records the
 * combined subscription (openAddedServiceSuccessor). An earlier one that was never paid is replaced and
 * cancelled at the provider after the commit. The customer is then sent to approve it.
 */
export async function startCombinedAddOn(
  deps: BasketDeps,
  input: { readonly businessId: string; readonly businessName: string; readonly email: string; readonly addOn: MonthlyAddOnId; readonly now: Date },
): Promise<CombinedAddOnStart> {
  const { staffDb, provider } = deps;
  const decided = await staffDb.transaction(async (tx) => {
    await lockBusinessForBilling(tx, input.businessId);
    return planCombinedAddOn(tx, { businessId: input.businessId, addOn: input.addOn, providerName: provider.name, now: input.now });
  });
  if (decided.kind !== "planned") return decided;
  const { planned } = decided;

  // An earlier combined subscription may have been paid while its webhook is still on its way: replacing it now would cancel what was
  // just paid and take the money a second time. Asked with no transaction open, like every provider call here.
  if (planned.replacing !== null && (await provider.findUpfrontPayment(planned.replacing.providerSubscriptionId)) !== null) {
    return { kind: "payment-pending" };
  }

  // The provider is asked with no transaction open: the plan for the new total, then the subscription that starts on the new date.
  const providerPlanId = await deps.ensureDiscountPlan(provider, planned.plan, planned.discountCents, planned.netCents, "month");
  const started = await provider.startCheckout({
    businessId: input.businessId,
    businessName: input.businessName,
    email: input.email,
    plan: planned.plan,
    billingInterval: "month",
    discountAmountCents: planned.discountCents,
    bundledAddOnNetCents: planned.netCents,
    ...(providerPlanId === undefined ? {} : { providerPlanId }),
    firstPayment: { amountCents: planned.upfrontCents, startAt: planned.newBillingDate },
  });
  const orphan = { businessId: input.businessId, subscriptionId: null, provider: provider.name, providerSubscriptionId: started.providerSubscriptionId } as const;

  let opened: { readonly subscription: Subscription } | null;
  try {
    opened = await staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, input.businessId);
      const now = await findSubscriptionById(tx, planned.subscription.id);
      const waiting = await findWaitingAddedServiceSuccessor(tx, planned.subscription.id);
      const unchanged =
        now !== null &&
        now.status === planned.subscription.status &&
        now.paidThroughAt?.getTime() === planned.subscription.paidThroughAt?.getTime() &&
        now.cancelRequestedAt === null &&
        (waiting?.id ?? null) === (planned.replacing?.id ?? null);
      if (!unchanged) return null;
      const subscription = await openAddedServiceSuccessor(tx, {
        continues: now,
        provider: provider.name,
        providerSubscriptionId: started.providerSubscriptionId,
        bundledAddOns: planned.lines,
        addOn: input.addOn,
        discountAmountCents: planned.discountCents,
        upfrontCents: planned.upfrontCents,
        newBillingDate: planned.newBillingDate,
        replacing: planned.replacing?.id ?? null,
        now: input.now,
      });
      // A service dropped, kept or changed while the provider was asked: the lines planned no longer fit, so nothing is kept.
      if ((await combinedStillFits(tx, subscription)) === null) throw new PlanNoLongerFits();
      return { subscription };
    }).catch((error: unknown) => {
      if (error instanceof PlanNoLongerFits) return null;
      throw error;
    });
  } catch (error) {
    logBillingEvent("error", "checkout-orphaned", { businessId: input.businessId, providerSubscriptionId: started.providerSubscriptionId, reason: "record-failed", ...describeError(error) });
    await cancelAtProvider(provider, orphan);
    throw error;
  }
  if (opened === null) {
    logBillingEvent("warn", "checkout-orphaned", { businessId: input.businessId, providerSubscriptionId: started.providerSubscriptionId, reason: "changed-meanwhile" });
    await cancelAtProvider(provider, orphan);
    return { kind: "changed" };
  }
  if (planned.replacing !== null) {
    await cancelAtProvider(provider, {
      businessId: input.businessId,
      subscriptionId: planned.replacing.id,
      provider: planned.replacing.provider,
      providerSubscriptionId: planned.replacing.providerSubscriptionId,
    });
  }
  return { kind: "approve", subscriptionId: opened.subscription.id, providerSubscriptionId: started.providerSubscriptionId, checkoutUrl: started.checkoutUrl };
}
