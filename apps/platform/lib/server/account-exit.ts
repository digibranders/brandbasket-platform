import "server-only";
import {
  cancelStaleSubscription,
  consumeRateLimit,
  findBusinessCurrency,
  findLiveBundledAddOns,
  findWaitingSuccessor,
  insertExitFeedback,
  isPackageOfferForfeited,
  listAddOnSubscriptionsForBusiness,
  lockBusinessForBilling,
  markCancelRequested,
  openAccountClosure,
  restoreAccountClosure,
  withTenantScope,
  type RateLimitRule,
} from "@brandbasket/db";
import { isMonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import {
  AddOnClosureChangedError,
  planAddOnClosure,
  recordAddOnClosure,
  stopAddOnsAtProvider,
} from "@brandbasket/shared/server/add-on-ends";
import { EXIT_REASON_OPTIONS } from "@brandbasket/shared/lib/account-exit";
import { formatIstTime } from "@brandbasket/shared/lib/teams-webhook";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import type { ExitDetails } from "@/lib/account-settings-form";
import { eraseAfterFor, hasRunningAddOns, packageEndsFor, planClosureFor } from "@/lib/account-exit-rules";
import { getBillingProvider } from "./billing";
import { checkPasswordFor } from "./account-security";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { announceCustomerToTeams } from "./teams";

/** Closing an account is cheap to ask for and consequential to finish, so the budget is small but never a trap. */
const EXIT_STEPS_PER_USER: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };

const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";
const CLOSE_FAILED =
  "We couldn’t end your plan just now, so your account is untouched and you haven’t been charged anything new. Please try again in a moment, or email us.";

/** Whether the business has an add-on running, for the Delete account page to say they stop with the paid month. */
export async function hasRunningAddOnsFor(customer: GrantedCustomer): Promise<boolean> {
  const { userId, businessId } = customer.tenant;
  const rows = await withTenantScope(getAppDb(), { userId, businessId }, (tx) => listAddOnSubscriptionsForBusiness(tx, businessId));
  return hasRunningAddOns(rows);
}

/**
 * What cancelling ends for this business, as the lines the Delete account page lists before the customer confirms
 * (packageEndsFor): empty unless closing will really end a paid plan that holds a package. The services that are staying,
 * the forfeit and the currency are read through row-level security as the signed-in customer; the ad credit is the one
 * frozen on their subscription.
 */
export async function loadPackageEndsFor(customer: GrantedCustomer): Promise<string[]> {
  const { subscription } = customer.billing;
  const closure = planClosureFor(subscription);
  if (subscription === null || (closure !== "end-with-period" && closure !== "note-only")) return [];
  const { userId, businessId } = customer.tenant;
  const { lines, forfeited, currency } = await withTenantScope(getAppDb(), { userId, businessId }, async (tx) => ({
    lines: await findLiveBundledAddOns(tx, businessId),
    forfeited: await isPackageOfferForfeited(tx, businessId),
    currency: await findBusinessCurrency(tx, businessId),
  }));
  if (currency === null) throw new Error(`No business with id ${businessId} to price a package for`);
  return packageEndsFor({
    services: lines.filter((row) => row.status === "active" && row.endRequestedAt === null).map((row) => row.addOn).filter(isMonthlyAddOnId),
    forfeited,
    adCreditCents: subscription.adCreditCents,
    currency,
  });
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
  // A plan kept after an earlier cancel (Keep my plan) has a new mandate waiting at the provider. It is what would take
  // the next payment, so it is the one cancelled; the plan it continues was already cancelled at its cycle end.
  const kept = subscription === null ? null : await findWaitingSuccessor(staffDb, subscription.id);
  if (kept !== null) {
    const provider = getBillingProvider();
    try {
      if (kept.provider !== provider.name) throw new Error(`The subscription belongs to ${kept.provider}, but ${provider.name} is configured.`);
      await provider.cancelSubscription(kept.providerSubscriptionId);
    } catch (error) {
      logBillingEvent("error", "provider-cancel-failed", {
        businessId,
        subscriptionId: kept.id,
        provider: kept.provider,
        providerSubscriptionId: kept.providerSubscriptionId,
        ...describeError(error),
      });
      return { kind: "refused", message: CLOSE_FAILED, field: null };
    }
  }

  if (subscription !== null && kept === null && (closure === "end-with-period" || closure === "drop-unpaid")) {
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
      // First, so a payment or a change to the services lands wholly before or wholly after the closure.
      await lockBusinessForBilling(tx, businessId);
      if (kept !== null) await cancelStaleSubscription(tx, { subscriptionId: kept.id, businessId, now });
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
  void announceCustomerToTeams({
    businessId,
    event: "account_closed",
    facts: [
      { name: "Reason", value: EXIT_REASON_OPTIONS.find((option) => option.value === input.reason)?.label },
      { name: "Plan paid until", value: subscription?.paidThroughAt ? formatIstTime(subscription.paidThroughAt) : null },
      { name: "Erased after", value: formatIstTime(eraseAfterFor(subscription, now)) },
    ],
    text: input.comment,
  });
  return { kind: "closed" };
}

/** Takes the account out of its closure, if it is in one. Signing in again is what asks for it. */
export async function restoreAccountFor(userId: string, now: Date): Promise<boolean> {
  return restoreAccountClosure(getStaffDb(), { userId, now });
}
