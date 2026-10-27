import "server-only";
import { randomUUID } from "node:crypto";
import { addMonthsUtc, decideCheckout, discountCentsFor, isChargeableDiscount } from "@brandbasket/billing";
import {
  BillingBusinessNotFoundError,
  findActivePlan,
  findBillingState,
  findBundledAddOnsForSubscription,
  findBusinessReferralCode,
  findRedeemableReferralCode,
  lockBusinessForBilling,
  markPackageOfferForfeited,
  openCheckoutSubscription,
  resolvePaymentAttention,
  type NewBundledAddOn,
  type ScopedTransaction,
  type Database,
  type OpenedMembership,
  type ReferralCode,
  type Subscription,
} from "@brandbasket/db";
import { addOnPrice, addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { reactivationNetCents, type ReactivationBasket } from "@brandbasket/shared/lib/billing/bundle";
import { packageLines } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { ManualPaymentDetails } from "@brandbasket/shared/lib/billing/manual-payment-form";
import { getBillingProvider } from "./billing-provider";
import { type ManualPaymentOutcome } from "@brandbasket/shared/lib/billing/manual-payment-notices";
import { activateFirstPayment, activateReactivationPayment } from "@brandbasket/shared/server/billing-activation";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { announcePaymentToTeams } from "./teams-admin";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { loadCarriedCode, loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";


export interface ManualFirstPayment extends ManualPaymentDetails {
  readonly businessId: string;
  /** The signed-in admin recording it. */
  readonly staffUserId: string;
}

interface ManualPaymentStep {
  readonly outcome: ManualPaymentOutcome;
  /** The unpaid checkout the manual subscription replaced, to cancel at its provider once committed. */
  readonly replaced: Subscription | null;
  /** Set when the payment turned a free listing account into a website client: it needs its Payload tenant. */
  readonly openedMembership?: OpenedMembership | null;
  /** The payment this recorded for the first time, to tell Teams about once committed. */
  readonly newPaymentId?: string | null;
}

/** What a first payment recorded by hand buys: the website alone, a single service at its list price, as a line. */
const MANUAL_SERVICE: MonthlyAddOnId = "managed-website";

/**
 * Whether an unpaid checkout holds more than the website alone: another service, or ad credit. A manual payment books the
 * website alone, so replacing such a checkout would silently drop what the client chose.
 */
async function holdsMoreThanWebsite(tx: ScopedTransaction, checkout: Subscription): Promise<boolean> {
  if (checkout.adCreditCents > 0) return true;
  const lines = await findBundledAddOnsForSubscription(tx, checkout.id);
  return lines.some((line) => line.addOn !== MANUAL_SERVICE);
}

/**
 * What a code is worth against what a manual payment buys (a percentage resolved to money against `listCents`: the one
 * service's list price for a first payment, the basket's package net for a reactivation, never the plan's 0), or null when none applies. A bank transfer is discounted the same
 * way a checkout is, so the amount recorded matches what the customer was actually asked to send, and a discounted
 * transfer does not look like an underpayment. An affiliate code that gives no discount is worth 0 and still applies,
 * so the payment earns its affiliate.
 */
function manualDiscount(code: ReferralCode | null, currency: MoneyCurrency, listCents: number): number | null {
  if (code === null || code.currency !== currency) return null;
  if (code.discount === null) return 0;
  const discountCents = discountCentsFor(code.discount, listCents);
  return isChargeableDiscount(listCents, discountCents) ? discountCents : null;
}

/** The code a lapsed business keeps when staff record its reactivation, with the months it has left and what it takes off the basket. */
export interface ManualCarriedCode {
  readonly code: ReferralCode;
  readonly monthsLeft: number | null;
  readonly discountCents: number;
}

/**
 * The code a manual reactivation carries, as the client's own reactivation does (loadCarriedCode: a lapse keeps its code for
 * the months it has left, the client's own cancel keeps nothing), priced on the basket's package net. Null when none carries, or
 * it cannot be charged against the basket. Read before the lapsed subscription is replaced; the client page shows the amount
 * from it and recordManualFirstPayment books the same.
 */
export async function loadManualCarriedCode(db: Database | ScopedTransaction, businessId: string, basket: ReactivationBasket, currency: MoneyCurrency): Promise<ManualCarriedCode | null> {
  const carried = await loadCarriedCode(db, businessId, basket);
  if (carried === null) return null;
  const discountCents = manualDiscount(carried.code, currency, reactivationNetCents(basket, currency));
  return discountCents === null ? null : { ...carried, discountCents };
}

/**
 * Records a first payment the team received outside any provider, such as a bank transfer. It buys the website alone at
 * its list price, as a line (the plan row costs nothing), less any code applied, and goes through the same activation as
 * a checkout (activateFirstPayment): the lines' total, the plan's own term, the lead marked paid. For a business that
 * paid before and lapsed it is a reactivation instead (activateReactivationPayment): its lapsed plan is ended and it
 * gets one month of the basket it lapsed with (loadReactivationBasket), at the offer that basket earns and with its ad
 * credit kept. A lapse (a failed payment, a revoked mandate) keeps its code for the months it has left, repriced on that
 * basket, and the payment counts one of them; a client who cancelled themselves gets no coupon. It also stores who recorded it, the bank or payment
 * reference, and the date the money arrived. The paid term starts when it is recorded, which is when access opens, not
 * on the date the money arrived.
 *
 * An unpaid checkout the customer left open is cancelled and replaced by a `manual` subscription, so the business
 * never holds two live ones; once the database has committed, that checkout is cancelled at the provider too, so it
 * can no longer take a second payment. One that holds more than the website (a package, another service, ad credit) is
 * not replaced: nothing is recorded, because the manual subscription would drop what the client chose. A payment waiting for staff on this business does not block recording: this
 * is one of the ways staff apply it.
 *
 * It does not send the customer's onboarding: they still check their answers and press Send on Check and send,
 * which works without paying once this is recorded.
 *
 * The caller must have checked that the signed-in staff member is an admin.
 */
export async function recordManualFirstPayment(input: ManualFirstPayment, now: Date): Promise<ManualPaymentOutcome> {
  const { businessId } = input;
  const step = await getStaffDb().transaction(async (tx): Promise<ManualPaymentStep> => {
    await lockBusinessForBilling(tx, businessId);
    const state = await findBillingState(tx, businessId);
    if (state === null) throw new BillingBusinessNotFoundError(businessId);
    const plan = await findActivePlan(tx, state.currency, state.tier);
    if (plan === null) return { outcome: { kind: "no-plan" }, replaced: null };

    // A business that has paid before is reactivating, which takes no new code: a lapse keeps the one it had (below).
    const applied = state.hasEverPaid ? null : await findBusinessReferralCode(tx, businessId);
    const redeemable =
      applied === null
        ? null
        : await findRedeemableReferralCode(tx, { code: applied.code, currency: state.currency, now });
    // The plan row costs nothing: the lines are the payment. A first payment buys the website at its list price; a
    // reactivation buys the basket the business lapsed with, read before its lapsed plan is replaced and ends its lines.
    const website = addOnPrice(addOnById(MANUAL_SERVICE), plan.currency);
    const reactivation = state.hasEverPaid ? await loadReactivationBasket(tx, businessId) : null;
    const lines: readonly NewBundledAddOn[] = packageLines(
      { services: reactivation?.services ?? [MANUAL_SERVICE], forfeited: reactivation?.forfeited ?? false },
      plan.currency,
    ).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: plan.taxRateBasisPoints,
    }));
    // A lapse keeps its code with the months it has left, even if the code was retired since; the redemption cap is not used again.
    const carried = reactivation === null ? null : await loadManualCarriedCode(tx, businessId, reactivation, plan.currency);
    const code = carried?.code ?? redeemable;
    const discountAmountCents = carried === null ? manualDiscount(redeemable, plan.currency, website.listCents) : carried.discountCents;

    const decision = decideCheckout(
      // A payment recorded by hand never reuses a checkout (it is opened at another provider): reuse and replace both end the unpaid one below.
      state.subscription === null ? null : { ...state.subscription, bundleKey: "" },
      { planId: plan.id, provider: "manual", referralCodeId: discountAmountCents === null ? null : code?.id ?? null, bundleKey: "" },
      now,
      { paymentUnderReview: false },
    );
    let replaced: Subscription | null;
    switch (decision.kind) {
      case "already-paid":
        return { outcome: { kind: "already-paid" }, replaced: null };
      case "payment-under-review":
        throw new Error("A manual payment is never held back by a payment under review");
      case "create":
        replaced = null;
        break;
      // A manual payment has no checkout to return to, so an unpaid one is always replaced, as is a lapsed plan being
      // reactivated. decideCheckout only ever reuses or replaces the newest subscription.
      case "reuse":
      case "replace":
        replaced = state.subscription;
        break;
      default: {
        const unhandled: never = decision;
        throw new Error(`Unhandled checkout decision: ${JSON.stringify(unhandled)}`);
      }
    }

    // A first payment books the website alone, so an unpaid checkout that holds a package (or any other service, or ad
    // credit) is not silently dropped: staff ask the client to finish that checkout, or contact the owner. A reactivation
    // books the basket of the checkout it replaces, so nothing is lost.
    if (!state.hasEverPaid && replaced !== null && replaced.status === "incomplete" && (await holdsMoreThanWebsite(tx, replaced))) {
      return { outcome: { kind: "package-open" }, replaced: null };
    }
    // A cancelled subscription has given the package offer up for good, whatever ended it.
    if (reactivation?.cancelled === true) await markPackageOfferForfeited(tx, businessId, now);

    const reference = randomUUID();
    const subscription = await openCheckoutSubscription(tx, {
      businessId,
      planId: plan.id,
      provider: "manual",
      providerSubscriptionId: `manual_sub_${reference}`,
      referralCodeId: discountAmountCents === null ? null : (code?.id ?? null),
      discountAmountCents: discountAmountCents ?? 0,
      discountMonthsLeft: discountAmountCents === null ? null : carried === null ? (redeemable?.discountMonths ?? null) : carried.monthsLeft,
      bundledAddOns: lines,
      ...(reactivation === null ? {} : { adCreditCents: reactivation.adCreditCents }),
      replacing: replaced?.id ?? null,
      now,
    });
    const manual = { recordedByStaffId: input.staffUserId, reference: input.reference, receivedOn: input.receivedOn };
    if (state.hasEverPaid) {
      // Reactivation: one month from now of the lines it was opened with, less the code a lapse kept, like a reactivation paid online.
      // The payment counts one of the code's months (activateReactivationPayment).
      const reactivated = await activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan,
        provider: "manual",
        providerPaymentId: `manual_pay_${reference}`,
        paidAt: now,
        paidThroughAt: addMonthsUtc(now, 1),
        manual,
      });
      return { outcome: { kind: "recorded" }, replaced, newPaymentId: reactivated.alreadyRecorded ? null : reactivated.payment.id };
    }
    const activation = await activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan,
      provider: "manual",
      providerPaymentId: `manual_pay_${reference}`,
      paidAt: now,
      discountAmountCents: discountAmountCents ?? 0,
      manual,
    });
    return { outcome: { kind: "recorded" }, replaced, openedMembership: activation.openedMembership, newPaymentId: activation.alreadyRecorded ? null : activation.payment.id };
  });

  if (step.newPaymentId != null) void announcePaymentToTeams(step.newPaymentId);

  // A free listing account that paid by bank transfer has just become a client, so it gets a client's Payload tenant.
  if (step.openedMembership != null) await syncTenantForBusiness({ businessId, name: step.openedMembership.businessName });

  if (step.replaced !== null) {
    await cancelAtProvider(getBillingProvider(), {
      businessId,
      subscriptionId: step.replaced.id,
      provider: step.replaced.provider,
      providerSubscriptionId: step.replaced.providerSubscriptionId,
    });
  }
  return step.outcome;
}

export interface FlaggedPaymentResolution {
  readonly paymentId: string;
  readonly businessId: string;
  /** The signed-in admin. */
  readonly staffUserId: string;
}

/**
 * Marks a flagged payment of `businessId` as dealt with, by the signed-in admin. Returns false when there was
 * nothing to resolve (already resolved, never flagged, another business's, or no such payment). The caller must have
 * checked the staff member is an admin.
 */
export async function resolveFlaggedPayment(input: FlaggedPaymentResolution, now: Date): Promise<boolean> {
  return resolvePaymentAttention(getStaffDb(), { ...input, now });
}

export type { ManualPaymentOutcome };
