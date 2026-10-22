import "server-only";
import { chargedAmountCents, mapRazorpayStatus, type RazorpayWebhookEvent } from "@brandbasket/billing";
import {
  completeBundledAddOnChanges,
  completePlanUpgradeAtRenewal,
  findAddOnSubscriptionByProviderId,
  findBundledAddOnsForSubscription,
  findPlanById,
  findSubscriptionByProviderId,
  flagPaymentForAttention,
  hasEverPaid,
  isPackageOfferForfeited,
  lockBusinessForBilling,
  recordUnappliedAddOnPayment,
  recordUnappliedPayment,
  renewalBundledLines,
  setPendingOfferDiscounts,
  updateAddOnStatus,
  updateSubscriptionProviderStatus,
  type AddOnSubscription,
  type OpenedMembership,
  type UnappliedPaymentReason,
} from "@brandbasket/db";
import { nextAddOnStatus } from "@brandbasket/shared/lib/billing/add-on-state";
import { applyAddOnPayment, type ProviderSubscriptionRef } from "@brandbasket/shared/server/add-on-activation";
import { packageMove } from "@brandbasket/shared/server/basket-change";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "@brandbasket/shared/server/billing-activation";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { getRazorpayProvider } from "./billing";
import { recordRazorpayChargePayment } from "./charges";
import { getStaffDb } from "./db";
import { syncTenantForBusiness } from "./payload-tenant-sync";

/** A free listing business this charge turned into a website client: it needs its Payload tenant once committed. */
interface NewMember extends OpenedMembership {
  readonly businessId: string;
}

type ChargedEvent = Extract<RazorpayWebhookEvent, { readonly kind: "charged" }>;
type StatusEvent = Extract<RazorpayWebhookEvent, { readonly kind: "status" }>;

/**
 * Applies one already-signature-verified webhook event. Idempotent: recordPaymentAndActivate (inside both
 * activate* helpers) is keyed on (provider, providerPaymentId), so a retried delivery of the same event writes
 * nothing a second time. Never throws for data it does not recognise — an event for a subscription we have not
 * recorded, or one already superseded, is logged and otherwise ignored, so the webhook route can always
 * acknowledge with 2xx and stop Razorpay from retrying forever.
 *
 * A first charge on a free listing account's subscription is the Premium membership being bought: activateFirstPayment
 * makes the business a website client in the same transaction, and once it has committed the business is given the
 * Payload tenant every client has, as a setup link does.
 *
 * A subscription id is looked up in the add-on table first (add-ons are separate subscriptions with their own table);
 * only an id that is not an add-on's goes on to the main plan's path. An id in neither is logged and ignored.
 */
export async function handleRazorpayWebhookEvent(event: RazorpayWebhookEvent): Promise<void> {
  if (event.kind === "unhandled") return;

  if (event.kind === "invalid") {
    // The signature already proved this came from Razorpay, so a payload we could not parse likely means a real
    // payment or status change did not get recorded — unlike "unhandled", this is always worth a loud log line.
    logBillingEvent("error", "confirmation-refused", {
      businessId: "unknown",
      subscriptionId: null,
      provider: "razorpay",
      reason: "webhook-payload-invalid",
      detail: event.reason,
    });
    return;
  }

  if (event.kind === "order-paid") {
    await recordRazorpayChargePayment(event, new Date());
    return;
  }

  if (event.kind === "status") {
    const addOn = await findAddOnSubscriptionByProviderId(getStaffDb(), "razorpay", event.subscriptionId);
    if (addOn !== null) {
      await handleAddOnStatus(event, addOn);
      return;
    }
    const known = await findSubscriptionByProviderId(getStaffDb(), "razorpay", event.subscriptionId);
    if (known === null) {
      logBillingEvent("warn", "confirmation-refused", {
        businessId: "unknown",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: event.subscriptionId,
        reason: "unknown-subscription",
      });
      return;
    }
    // Razorpay does not deliver webhooks in order: a "halted" sent before a retry succeeded can arrive after the
    // renewal it was overtaken by, and storing it would cut off a customer who has paid. The event only says the status
    // changed; what it is now is asked of Razorpay. A failure to ask throws, so Razorpay delivers the event again.
    const providerStatus = await getRazorpayProvider().fetchSubscriptionStatus(event.subscriptionId);
    await updateSubscriptionProviderStatus(getStaffDb(), {
      provider: "razorpay",
      providerSubscriptionId: event.subscriptionId,
      status: mapRazorpayStatus(providerStatus),
      providerStatus,
      now: new Date(),
    });
    return;
  }

  const addOn = await findAddOnSubscriptionByProviderId(getStaffDb(), "razorpay", event.subscriptionId);
  if (addOn !== null) {
    await handleAddOnCharge(event, addOn);
    return;
  }

  const newMember = await getStaffDb()
    .transaction(async (tx): Promise<NewMember | null> => {
      // Unlocked read, unavoidable: we don't know which business to lock until we know the subscription. Only
      // `businessId` may be trusted from this read — everything else must come from the post-lock re-read below.
      const initial = await findSubscriptionByProviderId(tx, "razorpay", event.subscriptionId);
      if (initial === null) {
        logBillingEvent("warn", "confirmation-refused", {
          businessId: "unknown",
          subscriptionId: null,
          provider: "razorpay",
          providerSubscriptionId: event.subscriptionId,
          providerPaymentId: event.paymentId,
          reason: "unknown-subscription",
        });
        return null;
      }
      await lockBusinessForBilling(tx, initial.businessId);

      // Re-read under the lock: another transaction for this business may have committed between the unlocked read
      // above and acquiring the lock (e.g. a burst of redelivered webhooks after an endpoint outage). Every decision
      // below — which plan amount is expected, whether this is a first payment or a renewal — must reflect what is
      // actually committed under the lock, not the stale pre-lock snapshot in `initial`.
      const subscription = await findSubscriptionByProviderId(tx, "razorpay", event.subscriptionId);
      if (subscription === null) {
        // The row cannot realistically vanish once created. Fail loudly rather than silently proceeding with a
        // stale reference if it ever does — this rethrows out of the transaction and is logged and retried.
        throw new Error(`Subscription for razorpay providerSubscriptionId ${event.subscriptionId} disappeared between the unlocked read and the post-lock re-read`);
      }

      // A cancelled subscription is final: a checkout we replaced, or a lapsed plan a reactivation ended. Money that lands
      // on one buys nothing, and activating it would also collide with the business's live subscription, so it is kept
      // for staff to refund, as the test checkout does.
      if (subscription.status === "cancelled") {
        await recordUnappliedPayment(tx, {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          kind: subscription.activatedAt === null ? "initial" : "renewal",
          amountCents: event.amountCents,
          currency: event.currency,
          paidAt: event.paidAt,
          reason: "checkout_replaced",
          now: new Date(),
          method: event.method,
        });
        logBillingEvent("warn", "confirmation-refused", {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          reason: "checkout_replaced",
        });
        return null;
      }

      // The first charge on a new subscription for a business that has paid before is a reactivation: one month of the
      // services it lapsed with, the lines frozen on this subscription when its checkout opened, with no coupon
      // (docs/superpowers/specs/2026-10-09-reactivation-design.md).
      const reactivating = subscription.activatedAt === null && (await hasEverPaid(tx, subscription.businessId));
      const plan = await findPlanById(tx, subscription.planId);
      // What Razorpay should have taken: the plan's net price less the discount frozen onto this subscription when
      // its checkout opened, with the plan's tax on top, from chargedAmountCents, the same function the Razorpay
      // plan's own amount was worked out with. The frozen discount, never the code's current one, keeps this in
      // step even if the code is edited or retired afterwards. If the two ever disagree, the charge falls through to
      // amount_mismatch below and lands in the attention queue rather than activating anything.
      const basePrice = subscription.activatedAt === null && !reactivating ? plan?.initialAmountCents : plan?.recurringAmountCents;
      // The services are billed as lines, every month: their frozen total is the price (the plan row costs nothing). A
      // reactivation is a fresh subscription with its own lines, frozen when its checkout opened.
      const bundledNetCents = subscription.bundledAddOnNetCents;
      const expectedAmount =
        plan === null || plan === undefined || basePrice === undefined || subscription.discountAmountCents >= basePrice + bundledNetCents
          ? undefined
          : chargedAmountCents(basePrice + bundledNetCents, subscription.discountAmountCents, plan.taxRateBasisPoints);
      // A customer who paid to move up to Premium is billed Premium from the next renewal: the provider was told to move
      // the subscription at the cycle end, so that renewal arrives at the new plan's price. It is recognised here, and
      // is the renewal that completes the move (below). `pendingPlanId` is the only thing that makes this price
      // acceptable, so a renewal at Premium's price from anyone who did not pay to move up is still refused.
      const pendingPlan =
        subscription.activatedAt === null || subscription.pendingPlanId === null
          ? null
          : await findPlanById(tx, subscription.pendingPlanId);
      const renewalAtNewPrice =
        pendingPlan !== null &&
        pendingPlan.currency === event.currency &&
        subscription.pendingDiscountAmountCents < pendingPlan.recurringAmountCents + subscription.bundledAddOnNetCents &&
        chargedAmountCents(
          pendingPlan.recurringAmountCents + subscription.bundledAddOnNetCents,
          subscription.pendingDiscountAmountCents,
          pendingPlan.taxRateBasisPoints,
        ) === event.amountCents;
      // A customer who added an add-on to the plan's payment, or took one out, is billed the new amount from the next renewal:
      // the provider was told to move the subscription at the cycle end. `pendingBundledAddOnNetCents` is the only thing that
      // makes this amount acceptable, so a renewal at a made-up price is still refused.
      const changeWaiting =
        !renewalAtNewPrice &&
        plan !== null &&
        plan !== undefined &&
        subscription.activatedAt !== null &&
        subscription.pendingBundledAddOnNetCents !== null &&
        plan.currency === event.currency;
      const renewalAtStoredPendingAmount =
        changeWaiting &&
        subscription.discountAmountCents < plan.recurringAmountCents + subscription.pendingBundledAddOnNetCents &&
        chargedAmountCents(
          plan.recurringAmountCents + subscription.pendingBundledAddOnNetCents,
          subscription.discountAmountCents,
          plan.taxRateBasisPoints,
        ) === event.amountCents;
      // The provider is moved before the lines are recorded, so a failure in between leaves it on the package price while the
      // stored pending amount is the one worked out when the service was paid for. While a change is waiting, the amount the
      // provider would have been told for the basket as it stands (what moveBasketAtProvider sends) is accepted too.
      const sentMove =
        changeWaiting && !renewalAtStoredPendingAmount
          ? packageMove(await findBundledAddOnsForSubscription(tx, subscription.id), await isPackageOfferForfeited(tx, subscription.businessId))
          : null;
      const renewalAtSentAmount =
        sentMove !== null &&
        plan !== null &&
        plan !== undefined &&
        sentMove.staying > 0 &&
        subscription.discountAmountCents < plan.recurringAmountCents + sentMove.netCents &&
        chargedAmountCents(plan.recurringAmountCents + sentMove.netCents, subscription.discountAmountCents, plan.taxRateBasisPoints) === event.amountCents;
      const renewalAtPendingAddOns = renewalAtStoredPendingAmount || renewalAtSentAmount;
      if (!renewalAtNewPrice && !renewalAtPendingAddOns && (plan === null || plan === undefined || expectedAmount !== event.amountCents || plan.currency !== event.currency)) {
        await recordUnappliedPayment(tx, {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          kind: subscription.activatedAt === null ? "initial" : "renewal",
          amountCents: event.amountCents,
          currency: event.currency,
          paidAt: event.paidAt,
          reason: "amount_mismatch",
          now: new Date(),
          method: event.method,
        });
        logBillingEvent("warn", "confirmation-refused", {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          reason: "amount_mismatch",
        });
        return null;
      }

      if (subscription.activatedAt === null) {
        // Not reachable with no plan: the amount check above refused it. (A renewal at a new price never has a first payment.)
        if (plan === null || plan === undefined) throw new Error(`Subscription ${subscription.id} has no plan to activate`);
        if (reactivating) {
          await activateReactivationPayment(tx, {
            businessId: subscription.businessId,
            subscriptionId: subscription.id,
            plan,
            provider: "razorpay",
            providerPaymentId: event.paymentId,
            paidAt: event.paidAt,
            // Razorpay's own cycle end, as for a renewal: the next charge falls on it.
            paidThroughAt: event.currentEnd,
            method: event.method,
          });
          return null;
        }
        const activation = await activateFirstPayment(tx, {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          plan,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          paidAt: event.paidAt,
          // Recorded at what Razorpay actually took, not at the plan's list price.
          discountAmountCents: subscription.discountAmountCents,
          method: event.method,
        });
        return activation.openedMembership === null ? null : { businessId: subscription.businessId, ...activation.openedMembership };
      } else {
        if (subscription.commitmentEndsAt === null) {
          // Should be unreachable: recordPaymentAndActivate always sets commitmentEndsAt on activation, so an
          // already-activated subscription (activatedAt !== null) having a null commitmentEndsAt is a real
          // data-integrity anomaly. Fail loudly instead of silently manufacturing a commitment date.
          throw new Error(`Subscription ${subscription.id} is activated but has no commitmentEndsAt`);
        }
        // What the amount check above accepted, so the invoice explains the charge by construction: the new plan for the
        // renewal that completes a paid move up, else the subscription's own plan with its frozen discount and stay offer.
        const renewedPlan = renewalAtNewPrice ? pendingPlan : plan;
        // The amount check above refused a renewal with no plan at either price, so this only guards the types.
        if (renewedPlan === null || renewedPlan === undefined) throw new Error(`Subscription ${subscription.id} renewed with no plan to invoice`);
        // The lines the provider was told about were never recorded as moving: record them now, so the invoice below and the
        // promotion after it see the basket the charge was made of.
        if (renewalAtSentAmount && sentMove !== null) {
          await setPendingOfferDiscounts(tx, { subscriptionId: subscription.id, lines: sentMove.moves, now: event.paidAt });
        }
        // At the new amount the charge covers the lines that are staying, those added this month included, each at the
        // package offer it moves to. At the amount billed now it covers what that amount was made of.
        const bundledAddOns = renewalBundledLines(await findBundledAddOnsForSubscription(tx, subscription.id), renewalAtPendingAddOns);
        const invoicedPrice = {
          plan: renewedPlan,
          bundledAddOns,
          netAmountCents: renewedPlan.recurringAmountCents,
          discountAmountCents: renewalAtNewPrice ? subscription.pendingDiscountAmountCents : subscription.discountAmountCents,
          retentionDiscountCents: renewalAtNewPrice ? 0 : subscription.retentionDiscountCents,
        };
        const renewal = await activateRenewalPayment(tx, {
          businessId: subscription.businessId,
          subscriptionId: subscription.id,
          commitmentEndsAt: subscription.commitmentEndsAt,
          provider: "razorpay",
          providerPaymentId: event.paymentId,
          amountCents: event.amountCents,
          currency: event.currency,
          paidAt: event.paidAt,
          paidThroughAt: event.currentEnd,
          // Razorpay's own cycle start, so the invoice's period matches Razorpay's; the payment time when it sent none.
          periodStart: event.currentStart ?? event.paidAt,
          invoicedPrice,
          providerStatus: "active",
          method: event.method,
        });
        // The first renewal at Premium's price is the move completing: the subscription now names Premium. A redelivery
        // of the same payment recorded nothing new and leaves the subscription as the first delivery left it.
        if (renewalAtPendingAddOns && !renewal.alreadyRecorded) {
          await completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: event.paidAt });
        } else if (subscription.pendingBundledAddOnNetCents !== null && !renewal.alreadyRecorded && !renewalAtNewPrice) {
          // Renewed at the old amount while an add-on change was waiting: the provider has not moved the subscription.
          // The customer paid the old amount for a basket that has changed (a service added, or one taken out that is still
          // charged), so the payment is flagged for staff, who see it under payments needing attention.
          logBillingEvent("warn", "bundled-renewal-at-old-amount", {
            businessId: subscription.businessId,
            subscriptionId: subscription.id,
            provider: "razorpay",
            providerPaymentId: event.paymentId,
          });
          await flagPaymentForAttention(tx, {
            paymentId: renewal.payment.id,
            businessId: subscription.businessId,
            reason: "add_on_provider_pending",
            now: event.paidAt,
          });
        }
        if (renewalAtNewPrice && !renewal.alreadyRecorded) {
          await completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now: event.paidAt });
        } else if (pendingPlan !== null && !renewal.alreadyRecorded) {
          // Renewed at the old price while a paid move up was waiting: the provider has not moved the subscription.
          logBillingEvent("warn", "upgrade-renewal-at-old-price", {
            businessId: subscription.businessId,
            subscriptionId: subscription.id,
            provider: "razorpay",
            providerPaymentId: event.paymentId,
          });
        }
        return null;
      }
    })
    .catch((error: unknown) => {
      logBillingEvent("error", "webhook-processing-failed", {
        businessId: "unknown",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: event.subscriptionId,
        reason: "webhook-processing-failed",
        ...describeError(error),
      });
      throw error;
    });

  if (newMember !== null) await syncTenantForBusiness({ businessId: newMember.businessId, name: newMember.businessName });
}

/**
 * A status event for an add-on subscription. As for the main plan, the event only says the status changed; what it is now
 * is asked of Razorpay, so a halt delivered after the renewal that overtook it cannot cut off an add-on that has been
 * paid for. A failure to ask throws, so Razorpay delivers the event again. The write only moves a row still in the
 * status it was read in: if another delivery got there first, this one has nothing left to do.
 */
async function handleAddOnStatus(event: StatusEvent, addOn: AddOnSubscription): Promise<void> {
  const providerStatus = await getRazorpayProvider().fetchSubscriptionStatus(event.subscriptionId);
  const now = new Date();
  const change = nextAddOnStatus(addOn.status, providerStatus, now, addOn.startAt);
  if (change === null) return;
  await updateAddOnStatus(getStaffDb(), {
    id: addOn.id,
    status: change.status,
    providerStatus,
    ...(change.haltedAt === undefined ? {} : { haltedAt: change.haltedAt }),
    ...(change.endedAt === undefined ? {} : { endedAt: change.endedAt }),
    now,
    expectedFrom: addOn.status,
  });
}

/**
 * A charge on an add-on subscription, following the main plan's lock and re-read pattern. Under the business's billing
 * lock the row is read again and the charge is checked against the price stored on it at purchase. A charge of another
 * amount or currency is kept for staff and opens nothing. Otherwise the payment goes through the one shared path
 * (applyAddOnPayment): recorded, the add-on opened for the period Razorpay says it paid for, and invoiced, or, when the
 * add-on cannot open, kept for staff as unapplied. Recording is idempotent on the Razorpay payment id, so a redelivery
 * writes nothing. A charge on a halted row is accepted whatever the grace: the customer has paid, so the add-on runs
 * again.
 *
 * What applyAddOnPayment asks to be cancelled is cancelled at the provider after the commit: the halted rows a payment
 * replaced, or, for a payment refused because the add-on is already billing or the checkout was replaced, this row's own
 * subscription, so it does not charge again next month. The provider is never called inside a transaction, and a
 * failure to cancel is logged, not thrown, because our records are already right.
 */
async function handleAddOnCharge(event: ChargedEvent, initial: AddOnSubscription): Promise<void> {
  const provider = getRazorpayProvider();
  const toCancel = await getStaffDb()
    .transaction(async (tx): Promise<readonly ProviderSubscriptionRef[]> => {
      await lockBusinessForBilling(tx, initial.businessId);
      // Re-read under the lock: only `businessId` may be trusted from the unlocked read.
      const addOn = await findAddOnSubscriptionByProviderId(tx, "razorpay", event.subscriptionId);
      if (addOn === null) {
        throw new Error(`Add-on subscription for razorpay providerSubscriptionId ${event.subscriptionId} disappeared between the unlocked read and the post-lock re-read`);
      }

      const record = {
        addOnSubscriptionId: addOn.id,
        provider: "razorpay",
        providerPaymentId: event.paymentId,
        amountCents: event.amountCents,
        currency: event.currency,
        paidAt: event.paidAt,
        // Razorpay's own cycle, so the invoice's period matches Razorpay's; the payment time when it sent no start.
        periodStart: event.currentStart ?? event.paidAt,
        periodEnd: event.currentEnd,
        method: event.method,
      } as const;
      const refused = (reason: UnappliedPaymentReason): void =>
        logBillingEvent("warn", "confirmation-refused", {
          businessId: addOn.businessId,
          subscriptionId: null,
          provider: "razorpay",
          providerSubscriptionId: event.subscriptionId,
          providerPaymentId: event.paymentId,
          reason,
        });

      if (addOn.chargedAmountCents !== event.amountCents || addOn.currency !== event.currency) {
        await recordUnappliedAddOnPayment(tx, { ...record, reason: "amount_mismatch", now: new Date() });
        refused("amount_mismatch");
        return [];
      }

      const applied = await applyAddOnPayment(tx, record, new Date());
      if (applied.kind === "refused") refused(applied.reason);
      return applied.cancelAtProvider;
    })
    .catch((error: unknown) => {
      logBillingEvent("error", "webhook-processing-failed", {
        businessId: initial.businessId,
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: event.subscriptionId,
        reason: "webhook-processing-failed",
        ...describeError(error),
      });
      throw error;
    });

  for (const target of toCancel) {
    await cancelAtProvider(provider, {
      businessId: initial.businessId,
      subscriptionId: null,
      provider: target.provider,
      providerSubscriptionId: target.providerSubscriptionId,
    });
  }
}
