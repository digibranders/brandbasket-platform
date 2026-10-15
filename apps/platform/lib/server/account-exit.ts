import "server-only";
import {
  applyRetentionDiscount,
  cancelStaleSubscription,
  consumeRateLimit,
  insertExitFeedback,
  listAddOnSubscriptionsForBusiness,
  markCancelRequested,
  openAccountClosure,
  restoreAccountClosure,
  withTenantScope,
  type RateLimitRule,
} from "@fynix/db";
import { renewalCharge } from "@fynix/shared/lib/billing/terms";
import { nextBundledNetCents } from "@fynix/shared/lib/billing/bundle";
import {
  AddOnClosureChangedError,
  planAddOnClosure,
  recordAddOnClosure,
  stopAddOnsAtProvider,
} from "@fynix/shared/server/add-on-ends";
import { cancelAtProvider } from "@fynix/shared/server/provider-cancellation";
import { describeError, logBillingEvent } from "@fynix/shared/server/billing-log";
import type { ExitDetails, RetentionOfferView } from "@/lib/account-settings-form";
import { eraseAfterFor, hasRunningAddOns, planClosureFor, retentionOfferTerms, type RetentionOfferTerms } from "@/lib/account-exit-rules";
import { getBillingProvider } from "./billing";
import { checkPasswordFor } from "./account-security";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/** Each step of the flow is cheap to ask for and consequential to finish, so the budget is small but never a trap. */
const EXIT_STEPS_PER_USER: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };

const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";
const OFFER_GONE = "That offer isn’t available any more.";
const OFFER_FAILED = "We couldn’t apply the offer just now, so nothing has changed. Please try again in a moment, or email us.";
const CLOSE_FAILED =
  "We couldn’t end your plan just now, so your account is untouched and you haven’t been charged anything new. Please try again in a moment, or email us.";

/** The offer as the page shows it, with the numbers behind it for the claim. */
interface ResolvedOffer {
  readonly terms: RetentionOfferTerms;
  readonly view: RetentionOfferView;
}

function resolveOffer(customer: GrantedCustomer, reason: ExitDetails["reason"]): ResolvedOffer | null {
  const { billing } = customer;
  const terms = retentionOfferTerms({
    reason,
    subscription: billing.subscription,
    plan: billing.plan,
    hasAccess: billing.hasAccess,
    upgradePaid: billing.upgradePaid,
  });
  const plan = billing.plan;
  const subscription = billing.subscription;
  if (terms === null || plan === null || subscription === null) return null;
  const newPrice = renewalCharge(plan, terms.totalDiscountCents, nextBundledNetCents(subscription));
  if (newPrice === null) return null;
  return {
    terms,
    view: { percent: terms.percent, currentPrice: renewalCharge(plan, subscription.discountAmountCents, nextBundledNetCents(subscription)), newPrice },
  };
}

/** What a member who gave this reason is offered to stay, or null. Reads only; nothing changes. */
export function findRetentionOfferView(customer: GrantedCustomer, reason: ExitDetails["reason"]): RetentionOfferView | null {
  return resolveOffer(customer, reason)?.view ?? null;
}

/** Whether the business has an add-on running, for the Delete account page to say they stop with the paid month. */
export async function hasRunningAddOnsFor(customer: GrantedCustomer): Promise<boolean> {
  const { userId, businessId } = customer.tenant;
  const rows = await withTenantScope(getAppDb(), { userId, businessId }, (tx) => listAddOnSubscriptionsForBusiness(tx, businessId));
  return hasRunningAddOns(rows);
}

export type RetentionClaimOutcome =
  | { readonly kind: "claimed"; readonly newPrice: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The member takes the stay offer. The provider is moved to the discounted plan from the next renewal first, and our
 * record follows: if the provider refuses, nothing here changes and the member is told so. If our record then cannot be
 * written, the provider is ahead of us; that is logged for staff, because the next renewal would arrive at a price we
 * do not expect. The offer is taken once (the update only matches a subscription that has none), so a double click
 * moves the provider to the same plan twice and records one offer.
 */
export async function claimRetentionOfferFor(
  customer: GrantedCustomer,
  details: ExitDetails,
): Promise<RetentionClaimOutcome> {
  const { userId, businessId } = customer.tenant;
  const budget = await consumeRateLimit(getAppDb(), `account-exit:user:${userId}`, EXIT_STEPS_PER_USER);
  if (!budget.allowed) return { kind: "refused", message: TOO_MANY_ATTEMPTS };

  const offer = resolveOffer(customer, details.reason);
  const { plan, subscription } = customer.billing;
  if (offer === null || plan === null || subscription === null) return { kind: "refused", message: OFFER_GONE };

  const provider = getBillingProvider();
  const logFields = { businessId, subscriptionId: subscription.id, provider: subscription.provider };
  try {
    if (subscription.provider !== "manual") {
      // A discount can only reach a subscription at the provider that holds it.
      if (subscription.provider !== provider.name) throw new Error(`The subscription belongs to ${subscription.provider}.`);
      const providerPlanId = await ensureDiscountPlan(provider, plan, offer.terms.totalDiscountCents, nextBundledNetCents(subscription));
      if (providerPlanId !== undefined) {
        await provider.changeSubscriptionPlanAtPeriodEnd(subscription.providerSubscriptionId, providerPlanId);
      }
    }
  } catch (error) {
    logBillingEvent("error", "retention-offer-failed", { ...logFields, ...describeError(error), stage: "provider" });
    return { kind: "refused", message: OFFER_FAILED };
  }

  const staffDb = getStaffDb();
  try {
    const applied = await applyRetentionDiscount(staffDb, {
      subscriptionId: subscription.id,
      businessId,
      retentionDiscountCents: offer.terms.discountCents,
    });
    if (!applied) return { kind: "refused", message: OFFER_GONE };
    await insertExitFeedback(staffDb, {
      reason: details.reason,
      comment: details.comment,
      planCode: plan.code,
      offerPercent: offer.terms.percent,
      outcome: "kept_with_offer",
    });
  } catch (error) {
    logBillingEvent("error", "retention-offer-failed", { ...logFields, ...describeError(error), stage: "record" });
    return { kind: "refused", message: OFFER_FAILED };
  }
  return { kind: "claimed", newPrice: offer.view.newPrice };
}

export type CloseAccountOutcome =
  | { readonly kind: "closed" }
  | { readonly kind: "refused"; readonly message: string; readonly field: "password" | null };

/**
 * Closes the account. In order: the password is checked; the plan is ended at the provider (a paid one with the period
 * it has paid for, an unpaid checkout outright), then every add-on the same way (a paid one with its month, one not
 * paid for outright), and if the provider refuses any of it nothing else happens, because a locked account must never
 * keep being charged; then, in one transaction, the plan's and the add-ons' ends are noted, the account is locked
 * behind its closure (erasable only after the grace period, restorable until then) and the feedback is kept.
 * A refused closure can simply be tried again: it records nothing, plans the same calls from the same rows, and the
 * provider's stop calls accept a subscription that is already stopped.
 * The caller signs the person out.
 */
export async function closeAccountFor(
  customer: GrantedCustomer,
  input: ExitDetails & { readonly password: string },
  now: Date,
): Promise<CloseAccountOutcome> {
  const { userId, businessId } = customer.tenant;
  const budget = await consumeRateLimit(getAppDb(), `account-exit:user:${userId}`, EXIT_STEPS_PER_USER);
  if (!budget.allowed) return { kind: "refused", message: TOO_MANY_ATTEMPTS, field: null };

  const password = await checkPasswordFor(userId, input.password);
  if (password === "limited") return { kind: "refused", message: TOO_MANY_ATTEMPTS, field: null };
  if (password === "wrong-password") return { kind: "refused", message: "That isn’t your password. Check it and try again.", field: "password" };

  const { subscription, plan } = customer.billing;
  const closure = planClosureFor(subscription);
  const staffDb = getStaffDb();

  if (subscription !== null && (closure === "end-with-period" || closure === "drop-unpaid")) {
    const provider = getBillingProvider();
    if (subscription.provider !== provider.name) {
      logBillingEvent("error", "provider-cancel-failed", {
        businessId,
        subscriptionId: subscription.id,
        provider: subscription.provider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        errorName: "ProviderNotConfigured",
        errorMessage: `The subscription belongs to ${subscription.provider}, but ${provider.name} is configured.`,
      });
      return { kind: "refused", message: CLOSE_FAILED, field: null };
    }
    try {
      if (closure === "end-with-period") {
        await provider.cancelSubscriptionAtPeriodEnd(subscription.providerSubscriptionId);
      } else {
        // An unpaid checkout: cancel it here first, then at the provider, so it cannot take money for a closed account.
        await cancelStaleSubscription(staffDb, { subscriptionId: subscription.id, businessId, now });
        await cancelAtProvider(provider, {
          businessId,
          subscriptionId: subscription.id,
          provider: subscription.provider,
          providerSubscriptionId: subscription.providerSubscriptionId,
        });
      }
    } catch (error) {
      logBillingEvent("error", "provider-cancel-failed", {
        businessId,
        subscriptionId: subscription.id,
        provider: subscription.provider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        ...describeError(error),
      });
      return { kind: "refused", message: CLOSE_FAILED, field: null };
    }
  }

  // Add-ons are separate subscriptions at the provider. They end the same way, and the same rule holds: the provider is
  // told first, with no transaction open, and nothing is recorded unless every call worked.
  const addOnSteps = planAddOnClosure(await listAddOnSubscriptionsForBusiness(staffDb, businessId));
  if (addOnSteps.length > 0 && !(await stopAddOnsAtProvider(getBillingProvider(), addOnSteps))) {
    return { kind: "refused", message: CLOSE_FAILED, field: null };
  }

  try {
    await staffDb.transaction(async (tx) => {
      if (subscription !== null && (closure === "end-with-period" || closure === "note-only")) {
        await markCancelRequested(tx, { subscriptionId: subscription.id, businessId, now });
      }
      await recordAddOnClosure(tx, businessId, addOnSteps, now);
      await openAccountClosure(tx, { userId, businessId, now, eraseAfter: eraseAfterFor(subscription, now) });
      await insertExitFeedback(tx, {
        reason: input.reason,
        comment: input.comment,
        planCode: plan?.code ?? null,
        offerPercent: null,
        outcome: "deleted",
      });
    });
  } catch (error) {
    // An add-on changed after its provider calls were planned. The transaction has rolled back; trying again plans it.
    if (error instanceof AddOnClosureChangedError) {
      logBillingEvent("error", "add-on-end-not-recorded", { businessId, ...describeError(error) });
      return { kind: "refused", message: CLOSE_FAILED, field: null };
    }
    throw error;
  }
  return { kind: "closed" };
}

/** Takes the account out of its closure, if it is in one. Signing in again is what asks for it. */
export async function restoreAccountFor(userId: string, now: Date): Promise<boolean> {
  return restoreAccountClosure(getStaffDb(), { userId, now });
}
