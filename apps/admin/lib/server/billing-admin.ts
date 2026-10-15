import "server-only";
import { randomUUID } from "node:crypto";
import { addMonthsUtc, decideCheckout, discountCentsFor, isChargeableDiscount } from "@fynix/billing";
import {
  BillingBusinessNotFoundError,
  findActivePlan,
  findBillingState,
  findBusinessReferralCode,
  findRedeemableReferralCode,
  lockBusinessForBilling,
  openCheckoutSubscription,
  resolvePaymentAttention,
  type OpenedMembership,
  type Plan,
  type ReferralCode,
  type Subscription,
} from "@fynix/db";
import type { ManualPaymentDetails } from "@fynix/shared/lib/billing/manual-payment-form";
import { getBillingProvider } from "./billing-provider";
import { type ManualPaymentOutcome } from "@fynix/shared/lib/billing/manual-payment-notices";
import { activateFirstPayment, activateReactivationPayment } from "@fynix/shared/server/billing-activation";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { cancelAtProvider } from "@fynix/shared/server/provider-cancellation";


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
}

/**
 * What a code the business applied is worth against its plan (a percentage resolved to money), or null when none
 * applies. A bank transfer is discounted the same way a checkout is, so the amount recorded matches what the customer
 * was actually asked to send, and a discounted transfer does not look like an underpayment. An affiliate code that
 * gives no discount is worth 0 and still applies, so the payment earns its affiliate.
 */
function manualDiscount(code: ReferralCode | null, plan: Plan): number | null {
  if (code === null || code.currency !== plan.currency) return null;
  if (code.discount === null) return 0;
  const discountCents = discountCentsFor(code.discount, plan.initialAmountCents);
  return isChargeableDiscount(plan.initialAmountCents, discountCents) ? discountCents : null;
}

/**
 * Records a first payment the team received outside any provider, such as a bank transfer. It goes through the same
 * activation as a checkout (activateFirstPayment): the plan's initial amount, the plan's own term, the lead marked
 * paid. For a business that paid before and lapsed it is a reactivation instead (activateReactivationPayment): its
 * lapsed plan is ended and it gets one month at today's monthly price, with no coupon. It also stores who recorded it, the bank or payment reference, and the date the money arrived. The paid
 * term starts when it is recorded, which is when access opens, not on the date the money arrived.
 *
 * An unpaid checkout the customer left open is cancelled and replaced by a `manual` subscription, so the business
 * never holds two live ones; once the database has committed, that checkout is cancelled at the provider too, so it
 * can no longer take a second payment. A payment waiting for staff on this business does not block recording: this
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

    // A business that has paid before is reactivating, which takes no code: today's full price.
    const applied = state.hasEverPaid ? null : await findBusinessReferralCode(tx, businessId);
    const redeemable =
      applied === null
        ? null
        : await findRedeemableReferralCode(tx, { code: applied.code, currency: state.currency, now });
    const discountAmountCents = manualDiscount(redeemable, plan);

    const decision = decideCheckout(
      // A payment recorded by hand carries no add-ons, so it never reuses a checkout opened with some.
      state.subscription === null ? null : { ...state.subscription, bundleKey: state.subscription.bundledAddOnNetCents > 0 ? "with-add-ons" : "" },
      { planId: plan.id, provider: "manual", referralCodeId: discountAmountCents === null ? null : redeemable?.id ?? null, bundleKey: "" },
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

    const reference = randomUUID();
    const subscription = await openCheckoutSubscription(tx, {
      businessId,
      planId: plan.id,
      provider: "manual",
      providerSubscriptionId: `manual_sub_${reference}`,
      referralCodeId: discountAmountCents === null ? null : (redeemable?.id ?? null),
      discountAmountCents: discountAmountCents ?? 0,
      replacing: replaced?.id ?? null,
      now,
    });
    const manual = { recordedByStaffId: input.staffUserId, reference: input.reference, receivedOn: input.receivedOn };
    if (state.hasEverPaid) {
      // Reactivation: one month from now at the plan's monthly price, like a reactivation paid online.
      await activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan,
        provider: "manual",
        providerPaymentId: `manual_pay_${reference}`,
        paidAt: now,
        paidThroughAt: addMonthsUtc(now, 1),
        manual,
      });
      return { outcome: { kind: "recorded" }, replaced };
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
    return { outcome: { kind: "recorded" }, replaced, openedMembership: activation.openedMembership };
  });

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
