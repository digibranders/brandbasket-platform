import "server-only";

import { CheckoutVerificationError, type BillingProvider, type StartedCheckout } from "@brandbasket/billing";
import {
  bundledNetCents,
  confirmKeptSubscription,
  consumeRateLimit,
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  findOpenClosureForUser,
  findPlanById,
  findSubscriptionById,
  findSubscriptionByProviderId,
  findWaitingSuccessor,
  isPackageOfferForfeited,
  listMembershipsForUser,
  lockBusinessForBilling,
  openKeptSubscription,
  restoreAccountClosureForBusiness,
  type AccountClosure,
  type BillingCurrency,
  type Database,
  type NewBundledAddOn,
  type Plan,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { reactivationBasketOf } from "@brandbasket/shared/lib/billing/bundle";
import { packageLines } from "@brandbasket/shared/lib/billing/packages";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { isSafeCheckoutUrl } from "@/lib/billing/checkout-url";
import { keepPlanOffered } from "@/lib/account-exit-rules";
import type { KeepPlanRefusal } from "@/lib/keep-plan-copy";
import { getBillingProvider } from "./billing";
import { CHECKOUT_RATE_LIMIT } from "./checkout";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/*
 * Keep my plan (docs/plans/18-platform-owner-decisions.md, Phase 5). The client cancelled at the provider, which cannot
 * be undone, so keeping the plan is a new mandate for the same plan that starts on the day the paid month ends. Nothing
 * is taken now. Once the provider holds the mandate the account closure is lifted and the plan shows as running; the
 * new subscription's first charge is recorded as a renewal of the old one (razorpay-webhook-handler.ts).
 *
 * The provider is never called inside a transaction, as in checkout.ts: the decision is made under the business's billing
 * lock, the provider is called with the lock released, and a second short transaction records the result.
 */

export type KeepPlanOutcome =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "refused"; readonly reason: KeepPlanRefusal };

function refused(reason: KeepPlanRefusal): KeepPlanOutcome {
  return { kind: "refused", reason };
}

/** The subscription the offer is about and the checkout waiting for it, read through the staff connection. */
interface KeepState {
  readonly closure: AccountClosure;
  readonly subscription: Subscription | null;
  readonly waiting: Subscription | null;
}

async function readKeepState(db: Database | ScopedTransaction, userId: string): Promise<KeepState | null> {
  const closure = await findOpenClosureForUser(db, userId);
  if (closure === null) return null;
  const subscription = await findLatestSubscriptionForBusiness(db, closure.businessId);
  const waiting = subscription === null ? null : await findWaitingSuccessor(db, subscription.id);
  return { closure, subscription, waiting };
}

/** Whether the restore-account page offers Keep my plan to this person. False for an account that is not closing. */
export async function loadKeepPlanOffered(userId: string, now: Date): Promise<boolean> {
  const state = await readKeepState(getStaffDb(), userId);
  return state !== null && keepPlanOffered(state, now);
}

/** What the new subscription is made of, worked out under the lock. */
interface PlannedKeep {
  readonly continues: Subscription;
  readonly waiting: Subscription | null;
  readonly bundle: readonly NewBundledAddOn[];
  readonly adCreditCents: number;
}

type PlanStep =
  | { readonly kind: "planned"; readonly planned: PlannedKeep; readonly plan: Plan }
  | { readonly kind: "refused"; readonly reason: KeepPlanRefusal };

/**
 * Opens the checkout for a new mandate that carries the cancelled plan on: the same plan, services (each at its current
 * package price, the offer not given up by the cancel), code with the months it has left, and ad credit, starting on the
 * day the paid month ends. Returns where to send the person to authorise it. The account closure is untouched until the
 * provider confirms the mandate (confirmKeptPlan), so abandoning the checkout leaves everything as it was.
 */
export async function startKeepPlanFor(
  user: { readonly id: string; readonly email: string },
  now: Date,
): Promise<KeepPlanOutcome> {
  const staffDb = getStaffDb();
  const provider = getBillingProvider();
  const closure = await findOpenClosureForUser(staffDb, user.id);
  if (closure === null) return refused("changed");
  const { businessId } = closure;
  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused("busy");

  const step = await staffDb.transaction(async (tx): Promise<PlanStep> => {
    await lockBusinessForBilling(tx, businessId);
    const subscription = await findLatestSubscriptionForBusiness(tx, businessId);
    const waiting = subscription === null ? null : await findWaitingSuccessor(tx, subscription.id);
    if (subscription === null || !keepPlanOffered({ subscription, waiting }, now) || subscription.provider !== provider.name) {
      return { kind: "refused", reason: "changed" };
    }
    const plan = await findPlanById(tx, subscription.planId);
    if (plan === null) return { kind: "refused", reason: "unavailable" };
    // The client's cancel ended nothing yet: read the basket as the subscription bills it, not as a cancelled one (which
    // would price it at list with no credit). The offer is only given up if the business gave it up earlier.
    const basket = reactivationBasketOf({
      subscription: { ...subscription, cancelRequestedAt: null },
      lines: await findBundledAddOnsForSubscription(tx, subscription.id),
      forfeited: await isPackageOfferForfeited(tx, businessId),
    });
    const bundle: readonly NewBundledAddOn[] = packageLines({ services: basket.services, forfeited: basket.forfeited }, plan.currency).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: plan.taxRateBasisPoints,
    }));
    // The frozen discount must leave something to charge, as the plan's own checkout requires.
    if (subscription.discountAmountCents >= plan.recurringAmountCents + bundledNetCents(bundle)) {
      return { kind: "refused", reason: "unavailable" };
    }
    return { kind: "planned", plan, planned: { continues: subscription, waiting, bundle, adCreditCents: basket.adCreditCents } };
  });
  if (step.kind === "refused") return refused(step.reason);
  const { planned, plan } = step;
  const { continues, waiting, bundle } = planned;
  const bundledAddOnNetCents = bundledNetCents(bundle);
  if (continues.paidThroughAt === null) return refused("changed");

  let providerPlanId: string | undefined;
  try {
    providerPlanId = await ensureDiscountPlan(provider, plan, continues.discountAmountCents, bundledAddOnNetCents);
  } catch (error) {
    logBillingEvent("error", "discount-plan-failed", {
      businessId,
      planId: plan.id,
      discountAmountCents: continues.discountAmountCents,
      bundledAddOnNetCents,
      ...describeError(error),
    });
    return refused("unavailable");
  }

  const businessName = (await listMembershipsForUser(getAppDb(), user.id)).find((membership) => membership.businessId === businessId)?.businessName ?? "";
  let started: StartedCheckout;
  try {
    started = await provider.startCheckout({
      businessId,
      businessName,
      email: user.email,
      plan,
      discountAmountCents: continues.discountAmountCents,
      bundledAddOnNetCents,
      startAt: continues.paidThroughAt,
      ...(providerPlanId === undefined ? {} : { providerPlanId }),
    });
  } catch (error) {
    logBillingEvent("error", "checkout-orphaned", { businessId, reason: "provider-start-failed", ...describeError(error) });
    return refused("unavailable");
  }
  const orphan = { businessId, subscriptionId: null, provider: provider.name, providerSubscriptionId: started.providerSubscriptionId } as const;
  if (!isSafeCheckoutUrl(started.checkoutUrl)) {
    logBillingEvent("error", "checkout-orphaned", { businessId, providerSubscriptionId: started.providerSubscriptionId, reason: "unsafe-checkout-url" });
    await cancelAtProvider(provider, orphan);
    return refused("unavailable");
  }

  let recorded: boolean;
  try {
    recorded = await staffDb.transaction(async (tx): Promise<boolean> => {
      await lockBusinessForBilling(tx, businessId);
      const latest = await findLatestSubscriptionForBusiness(tx, businessId);
      const stillWaiting = latest === null ? null : await findWaitingSuccessor(tx, latest.id);
      // The decision was made before the provider was called: another keep, a payment or a second cancel may have moved it.
      if (
        latest === null ||
        latest.id !== continues.id ||
        latest.paidThroughAt?.getTime() !== continues.paidThroughAt?.getTime() ||
        stillWaiting?.id !== waiting?.id ||
        !keepPlanOffered({ subscription: latest, waiting: stillWaiting }, now)
      ) {
        return false;
      }
      await openKeptSubscription(tx, {
        continues: latest,
        provider: provider.name,
        providerSubscriptionId: started.providerSubscriptionId,
        bundledAddOns: bundle,
        adCreditCents: planned.adCreditCents,
        replacing: waiting?.id ?? null,
        now,
      });
      return true;
    });
  } catch (error) {
    logBillingEvent("error", "checkout-orphaned", { businessId, providerSubscriptionId: started.providerSubscriptionId, reason: "record-failed", ...describeError(error) });
    await cancelAtProvider(provider, orphan);
    throw error;
  }
  if (!recorded) {
    logBillingEvent("warn", "checkout-orphaned", { businessId, providerSubscriptionId: started.providerSubscriptionId, reason: "changed-meanwhile" });
    await cancelAtProvider(provider, orphan);
    return refused("changed");
  }
  if (waiting !== null) {
    await cancelAtProvider(provider, { businessId, subscriptionId: waiting.id, provider: waiting.provider, providerSubscriptionId: waiting.providerSubscriptionId });
  }
  return { kind: "redirect", url: started.checkoutUrl };
}

/**
 * The provider holds the new mandate (or, charged first, has taken its first payment): the successor is authorised, the
 * subscription it continues no longer shows the client's cancel, and the account closure is lifted. Idempotent: a
 * subscription that is not a kept plan still waiting to start changes nothing. The caller holds the business's billing lock.
 * The add-on subscriptions the closure ended at the provider stay ended: the provider cannot undo that cancel either.
 */
export async function restoreKeptPlan(tx: ScopedTransaction, subscriptionId: string, now: Date): Promise<boolean> {
  const confirmed = await confirmKeptSubscription(tx, { subscriptionId, now });
  if (confirmed === null) return false;
  await restoreAccountClosureForBusiness(tx, { businessId: confirmed.businessId, now });
  return true;
}

/**
 * Confirms a kept plan's mandate on its own, under the billing lock: the fake provider's confirm page. The webhook does
 * the same inside its own transaction for Razorpay. False when the subscription is not a kept plan waiting to start.
 */
export async function confirmKeptPlan(subscriptionId: string, now: Date): Promise<boolean> {
  return getStaffDb().transaction(async (tx) => {
    const successor = await findSubscriptionById(tx, subscriptionId);
    if (successor === null || successor.continuesId === null) return false;
    await lockBusinessForBilling(tx, successor.businessId);
    return restoreKeptPlan(tx, subscriptionId, now);
  });
}

/** A checkout the signed-in, closing account may complete: its token or pay page is for its own waiting successor. */
export interface KeepCheckout {
  readonly closure: AccountClosure;
  readonly successor: Subscription;
}

/** The business's own waiting keep checkout for the pay page, or null when there is none (it was authorised, replaced or never opened). */
export async function findKeepCheckoutFor(userId: string): Promise<KeepCheckout | null> {
  const state = await readKeepState(getStaffDb(), userId);
  if (state === null || state.waiting === null) return null;
  return { closure: state.closure, successor: state.waiting };
}

/**
 * Checks what the fake provider's keep checkout handed back, without writing anything: the signature, the expiry, and
 * that it is the signed-in, closing account's own waiting checkout. Returns the checkout and its amount, or null.
 */
export async function verifyKeepCheckoutFor(
  provider: BillingProvider,
  userId: string,
  payload: unknown,
): Promise<{ readonly checkout: KeepCheckout; readonly amountCents: number; readonly currency: BillingCurrency } | null> {
  const checkout = await findKeepCheckoutFor(userId);
  if (checkout === null) return null;
  try {
    const confirmed = await provider.confirmCheckout(payload);
    if (confirmed.businessId !== checkout.closure.businessId) return null;
    const known = await findSubscriptionByProviderId(getStaffDb(), provider.name, confirmed.providerSubscriptionId);
    if (known === null || known.id !== checkout.successor.id) return null;
    return { checkout, amountCents: confirmed.amountCents, currency: confirmed.currency };
  } catch (error) {
    if (error instanceof CheckoutVerificationError) return null;
    throw error;
  }
}
