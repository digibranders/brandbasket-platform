import "server-only";

import { bundleKey, decideCheckout, type BillingProvider, type CheckoutDecision, type StartedCheckout } from "@brandbasket/billing";
import {
  BillingBusinessNotFoundError,
  consumeRateLimit,
  findActivePlan,
  findBillingState,
  findBusinessEntry,
  bundledNetCents,
  findBundledAddOnsForSubscription,
  findBusinessReferralCode,
  findLatestSubscriptionForBusiness,
  findRedeemableReferralCode,
  isPackageOfferForfeited,
  lockBusinessForBilling,
  markPackageOfferForfeited,
  openCheckoutSubscription,
  withTenantScope,
  type NewBundledAddOn,
  type Plan,
  type PlanTier,
  type RateLimitRule,
  type Subscription,
} from "@brandbasket/db";
import { isSafeCheckoutUrl } from "@/lib/billing/checkout-url";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection, WEBSITE_ALONE, type ReactivationBasket } from "@brandbasket/shared/lib/billing/bundle";
import { adCreditCentsAtCheckout, packageLines } from "@brandbasket/shared/lib/billing/packages";
import { PAYMENT_RECEIVED_MESSAGE, PAYMENT_STEP_HREF, REACTIVATE_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import { firstMissing, onboardingChecklist } from "@brandbasket/shared/lib/onboarding/checklist";
import { MEMBER_HOME } from "@/lib/membership";
import { checklistInputFrom } from "@/lib/onboarding/snapshot";
import { businessDetails } from "@brandbasket/shared/lib/site-config";
import { getBillingProvider } from "./billing";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { missingProblem, readOnboardingSnapshot, type StepProblem } from "./onboarding";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { codeBasisFor, discountFrom, PACKAGE_TAKES_NO_CODE, type AppliedDiscount } from "./referrals";
import { ensureDiscountPlan } from "./discount-plans";

/** A stuck button or a script must not be able to open subscriptions at the provider without limit. */
export const CHECKOUT_RATE_LIMIT: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

export type CheckoutOutcome =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "refused"; readonly problem: StepProblem };

/** The provider handed back a checkout this site will not send a customer to. */
export class UnsafeCheckoutUrlError extends Error {
  constructor() {
    super("The billing provider returned a checkout URL that is neither a local path nor https.");
    this.name = "UnsafeCheckoutUrlError";
  }
}

/** The provider was asked to reopen one subscription and answered with another. */
export class CheckoutMismatchError extends Error {
  constructor() {
    super("The billing provider reopened a different subscription from the one it was asked for.");
    this.name = "CheckoutMismatchError";
  }
}

function refused(message: string, fixHref?: string): CheckoutOutcome {
  return { kind: "refused", problem: { message, field: null, ...(fixHref === undefined ? {} : { fixHref }) } };
}

const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";
const NOTHING_TO_PAY_FOR = `There’s nothing to pay for right now. If you think that’s wrong, email us at ${businessDetails.email}.`;
const NO_PLAN = `We can’t take payment in your currency just yet. Email us at ${businessDetails.email} and we’ll sort it out.`;
const CHANGED_MEANWHILE = "Something changed while we were setting up your payment. Please try again.";
const ALREADY_A_MEMBER = "You’ve already paid for Managed Website. Open your dashboard to carry on.";
const PAYMENT_UNAVAILABLE = "We couldn’t open your payment just now. Please try again in a minute.";
const NO_SERVICES = "Choose at least one service to continue.";

/** What was decided under the lock, carried past its commit. */
interface PlannedCheckout {
  readonly plan: Plan;
  readonly decision: CheckoutDecision;
  /** The newest subscription as the decision saw it; the second transaction checks it has not moved. */
  readonly latest: Subscription | null;
  /**
   * The referral discount in force, re-validated under the lock, or null. Its `amountCents` is frozen onto the new
   * subscription and is what every later amount check subtracts, never recomputed from the code's percentage.
   */
  readonly discount: AppliedDiscount | null;
  /**
   * The services taken at this checkout, priced as a package when there are two or more (packages.ts) unless the business
   * has given the offer up. The plan row costs nothing, so these are the whole charge. A business that has paid before
   * takes the basket it lapsed with (loadReactivationBasket).
   */
  readonly bundle: readonly NewBundledAddOn[];
  /**
   * Ad credit a month for a package bought together at the business's first paid checkout (adCreditCentsAtCheckout), frozen onto
   * the subscription; 0 for anyone who gave the offer up. A reactivation carries over what the lapsed subscription kept and
   * grants none of its own.
   */
  readonly adCreditCents: number;
  /**
   * The basket this checkout was priced from when the business has paid before, or null. The second transaction reads it again
   * under its lock and opens nothing if it moved, so what is recorded is what was priced.
   */
  readonly reactivation: ReactivationBasket | null;
}

type DecisionStep =
  | { readonly kind: "planned"; readonly planned: PlannedCheckout }
  | { readonly kind: "no-plan" }
  | { readonly kind: "code-on-package" };

function sameSubscriptionState(seen: Subscription | null, now: Subscription | null): boolean {
  if (seen === null || now === null) return seen === now;
  return seen.id === now.id && seen.status === now.status;
}

/** Whether a basket read again is the one the checkout was priced from: the same services, offer, credit and cancellation. */
function sameBasket(priced: ReactivationBasket, now: ReactivationBasket): boolean {
  return (
    priced.forfeited === now.forfeited &&
    priced.cancelled === now.cancelled &&
    priced.adCreditCents === now.adCreditCents &&
    priced.services.length === now.services.length &&
    priced.services.every((service, index) => service === now.services[index])
  );
}

function checkedUrl(started: StartedCheckout): string {
  if (!isSafeCheckoutUrl(started.checkoutUrl)) throw new UnsafeCheckoutUrlError();
  return started.checkoutUrl;
}

/**
 * Opens a new subscription at the provider and records it. The provider is called with no transaction open, so a
 * slow provider holds no lock; a second short transaction then checks that the business's newest subscription is
 * still the one the decision saw and records the new one (cancelling the stale checkout it replaces in the same
 * transaction). If that check fails, or recording fails, the subscription just opened at the provider is an orphan:
 * it is cancelled there and logged. A replaced checkout is cancelled at the provider only after the commit.
 */
async function openNewCheckout(
  customer: GrantedCustomer,
  provider: BillingProvider,
  planned: PlannedCheckout,
  replacing: Subscription | null,
  now: Date,
): Promise<CheckoutOutcome> {
  const { user, tenant } = customer;
  const { discount } = planned;
  const discountAmountCents = discount?.amountCents ?? 0;
  const bundledAddOnNetCents = bundledNetCents(planned.bundle);
  // Razorpay charges a subscription its plan's amount, so a discount, or add-ons billed with the plan, is a plan of its own.
  // Made (or found) before anything is opened at the provider: if it cannot be made, nothing exists to clean up.
  let providerPlanId: string | undefined;
  try {
    providerPlanId = await ensureDiscountPlan(provider, planned.plan, discountAmountCents, bundledAddOnNetCents);
  } catch (error) {
    logBillingEvent("error", "discount-plan-failed", {
      businessId: tenant.businessId,
      planId: planned.plan.id,
      discountAmountCents,
      bundledAddOnNetCents,
      ...describeError(error),
    });
    return refused(PAYMENT_UNAVAILABLE);
  }
  const started = await provider.startCheckout({
    businessId: tenant.businessId,
    businessName: tenant.businessName,
    email: user.email,
    plan: planned.plan,
    discountAmountCents,
    bundledAddOnNetCents,
    ...(providerPlanId === undefined ? {} : { providerPlanId }),
  });
  const orphan = {
    businessId: tenant.businessId,
    subscriptionId: null,
    provider: provider.name,
    providerSubscriptionId: started.providerSubscriptionId,
  } as const;
  const orphanFields = { businessId: tenant.businessId, providerSubscriptionId: started.providerSubscriptionId };

  let url: string;
  let recorded: boolean;
  try {
    url = checkedUrl(started);
    recorded = await getStaffDb().transaction(async (tx): Promise<boolean> => {
      await lockBusinessForBilling(tx, tenant.businessId);
      const latest = await findLatestSubscriptionForBusiness(tx, tenant.businessId);
      if (!sameSubscriptionState(planned.latest, latest)) return false;
      if (planned.reactivation !== null) {
        // The first transaction priced the basket before the provider was called. A cancel request, or a service asked to end,
        // can land in between without moving the subscription's id or status, so read it again here and price nothing else.
        const basket = await loadReactivationBasket(tx, tenant.businessId);
        if (!sameBasket(planned.reactivation, basket)) return false;
        // A cancelled subscription has given the package offer up for good, whatever ended it: written with the checkout it
        // belongs to, not before the decision to open one.
        if (basket.cancelled) await markPackageOfferForfeited(tx, tenant.businessId, now);
      }
      await openCheckoutSubscription(tx, {
        businessId: tenant.businessId,
        planId: planned.plan.id,
        provider: provider.name,
        providerSubscriptionId: started.providerSubscriptionId,
        referralCodeId: discount?.codeId ?? null,
        discountAmountCents: discount?.amountCents ?? 0,
        bundledAddOns: planned.bundle,
        adCreditCents: planned.adCreditCents,
        replacing: replacing?.id ?? null,
        now,
      });
      return true;
    });
  } catch (error) {
    logBillingEvent("error", "checkout-orphaned", { ...orphanFields, reason: "record-failed", ...describeError(error) });
    await cancelAtProvider(provider, orphan);
    throw error;
  }

  if (!recorded) {
    logBillingEvent("warn", "checkout-orphaned", { ...orphanFields, reason: "changed-meanwhile" });
    await cancelAtProvider(provider, orphan);
    return refused(CHANGED_MEANWHILE);
  }

  if (replacing !== null) {
    await cancelAtProvider(provider, {
      businessId: tenant.businessId,
      subscriptionId: replacing.id,
      provider: replacing.provider,
      providerSubscriptionId: replacing.providerSubscriptionId,
    });
  }
  return { kind: "redirect", url };
}

/**
 * Starts the first payment from Check and send. The caller has already checked the customer is signed in; this
 * checks everything else on the server, whatever the page showed:
 *
 * 1. at most CHECKOUT_RATE_LIMIT attempts per business;
 * 2. while the answers are still open, the onboarding checklist passes on stored data, because a customer must not
 *    pay for a build we cannot start (answers already sent, before payment was required, are not re-checked: those
 *    customers must always be able to pay);
 * 3. the plan's checkout is opened (openPlanCheckout).
 *
 * Returns where to send the customer, or why not.
 */
export async function startCheckoutFor(customer: GrantedCustomer, now: Date): Promise<CheckoutOutcome> {
  const { tenant } = customer;
  const appDb = getAppDb();

  const limit = await consumeRateLimit(appDb, `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const snapshot = await withTenantScope(appDb, tenant, readOnboardingSnapshot);
  if (snapshot.project === null) return refused(NOTHING_TO_PAY_FOR);
  if (!snapshot.locked) {
    const missing = firstMissing(onboardingChecklist(checklistInputFrom(snapshot)));
    if (missing !== null) return { kind: "refused", problem: missingProblem(missing) };
  }

  return openPlanCheckout(customer, now, PAYMENT_STEP_HREF, null, WEBSITE_ALONE);
}

/**
 * Starts the first payment for Managed Website from the account a sign-up opened (docs/plans/11-platform-plans.md in the
 * BrandBasket workspace). These members pay before there is a project or a single answer, so neither is
 * asked for: the payment itself opens the project (activateFirstPayment). Checked on the server, whatever the page
 * showed: the same rate limit as any checkout, and that the business really is a free listing account, since a
 * website client pays on Check and send, where its answers are checked first.
 *
 * `tier` is the plan whose page the owner pressed Pay on: a free account may buy either, whichever it chose at sign-up.
 * A later checkout of the same account replaces an unpaid one of the other plan, as it replaces any stale one.
 * `services` is the basket the page named, the whole subscription, read the way every basket is (each service once, in the
 * catalogue's order); an empty one is refused.
 *
 * The kind is read before the lock rather than under it. A payment landing in between has made the business a client
 * with a paid subscription, which the decision under the lock then sees and answers by sending it to its dashboard.
 */
export async function startMembershipCheckoutFor(
  customer: GrantedCustomer,
  now: Date,
  tier: PlanTier,
  services: readonly MonthlyAddOnId[],
): Promise<CheckoutOutcome> {
  const { tenant } = customer;
  const appDb = getAppDb();

  const limit = await consumeRateLimit(appDb, `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const entry = await withTenantScope(appDb, tenant, (tx) => findBusinessEntry(tx, tenant.businessId));
  if (entry?.kind !== "listing") return refused(ALREADY_A_MEMBER);

  return openPlanCheckout(customer, now, MEMBER_HOME, tier, readBundleSelection(services));
}

/**
 * Reactivate on Billing (docs/superpowers/specs/2026-10-09-reactivation-design.md): a business that paid before and has
 * lapsed opens a checkout for the basket it lapsed with (loadReactivationBasket), with no coupon, and its lapsed
 * subscription is replaced.
 * Checked on the server, whatever the page showed: the same rate limit as any checkout, then that the business really
 * has lapsed. A paid-up one is sent to Billing, and one that never paid has nothing to restart. Its project is live,
 * so there is no onboarding to check.
 */
export async function startReactivationFor(customer: GrantedCustomer, now: Date): Promise<CheckoutOutcome> {
  const { tenant, billing } = customer;
  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);
  if (billing.status === "paid") return { kind: "redirect", url: REACTIVATE_HREF };
  if (billing.status !== "lapsed") return refused(NOTHING_TO_PAY_FOR);
  return openPlanCheckout(customer, now, REACTIVATE_HREF, null, WEBSITE_ALONE);
}

/**
 * Opens the plan's checkout for a business its caller has already cleared to pay:
 *
 * 1. under a per-business lock on the staff connection (customers never write billing rows), the billing package
 *    decides whether to send them back to a recent unpaid checkout, replace a stale or lapsed one, or open a new one;
 *    an already-paid business is sent to `paidHref`, and one whose earlier payment is waiting for staff is told so
 *    rather than charged again;
 * 2. with the lock released, the provider is called, and a new subscription is recorded (see openNewCheckout).
 *
 * `tier` is the plan being bought, or null for a business that is already on one (a website client paying on Check and
 * send), which pays for the plan its billing state names. `chosen` is the basket bought, never empty: a checkout for
 * nothing is refused before anything is read. A business that has paid before is reactivating and buys the basket it
 * lapsed with instead (loadReactivationBasket), whatever `chosen` says. A code is priced against the one service it is
 * used on; a package of two or more refuses one (owner, plan 16 Settled 2).
 */
async function openPlanCheckout(
  customer: GrantedCustomer,
  now: Date,
  paidHref: string,
  tier: PlanTier | null,
  chosen: readonly MonthlyAddOnId[],
): Promise<CheckoutOutcome> {
  if (chosen.length === 0) return refused(NO_SERVICES);
  const { tenant } = customer;
  const provider = getBillingProvider();
  const first = await getStaffDb().transaction(async (tx): Promise<DecisionStep> => {
    await lockBusinessForBilling(tx, tenant.businessId);
    const state = await findBillingState(tx, tenant.businessId);
    if (state === null) throw new BillingBusinessNotFoundError(tenant.businessId);
    // The plan the business is on or chose: Managed Website, in the business's currency.
    const plan = await findActivePlan(tx, state.currency, tier ?? state.tier);
    if (plan === null) return { kind: "no-plan" };
    // Re-validated here, under the lock, rather than trusted from when the customer pressed Apply: a code can be
    // deactivated, expire or hit its cap in between, and the amount frozen on the subscription must be the one
    // that was true at the moment the checkout opened. A business that has paid before is reactivating, which takes
    // no code (docs/superpowers/specs/2026-10-09-reactivation-design.md): it pays today's full price.
    const applied = state.hasEverPaid ? null : await findBusinessReferralCode(tx, tenant.businessId);
    const redeemable =
      applied === null
        ? null
        : await findRedeemableReferralCode(tx, { code: applied.code, currency: state.currency, now });
    // The plan row is the terms at a price of 0: every service, the website included, is a line. A business that has paid
    // before is reactivating: the basket it lapsed with, read before the lapsed subscription is replaced and ends its lines.
    const reactivation = state.hasEverPaid ? await loadReactivationBasket(tx, tenant.businessId) : null;
    const services = reactivation?.services ?? chosen;
    if (redeemable !== null && services.length > 1) return { kind: "code-on-package" };
    const basis = codeBasisFor(services, plan.currency);
    const discount = redeemable === null || basis === null ? null : discountFrom(redeemable, basis);
    const forfeited = reactivation?.forfeited ?? (await isPackageOfferForfeited(tx, tenant.businessId));
    const bundle: readonly NewBundledAddOn[] = packageLines({ services, forfeited }, plan.currency).map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: plan.taxRateBasisPoints,
    }));
    // Ad credit is for services bought together at the first purchase. A reactivation grants none and keeps what the lapsed
    // subscription had.
    const adCreditCents = reactivation?.adCreditCents ?? adCreditCentsAtCheckout({ services, forfeited, hasEverPaid: false }, plan.currency);
    const latestBundleKey =
      state.subscription === null ? "" : bundleKey((await findBundledAddOnsForSubscription(tx, state.subscription.id)).filter((row) => row.status === "pending").map((row) => row.addOn));
    const decision = decideCheckout(
      state.subscription === null ? null : { ...state.subscription, bundleKey: latestBundleKey },
      { planId: plan.id, provider: provider.name, referralCodeId: discount?.codeId ?? null, bundleKey: bundleKey(bundle.map((item) => item.addOn)) },
      now,
      state,
    );
    return { kind: "planned", planned: { plan, decision, latest: state.subscription, discount, bundle, adCreditCents, reactivation } };
  });
  if (first.kind === "no-plan") return refused(NO_PLAN);
  if (first.kind === "code-on-package") return refused(PACKAGE_TAKES_NO_CODE);

  const { planned } = first;
  const { decision } = planned;
  switch (decision.kind) {
    case "already-paid":
      return { kind: "redirect", url: paidHref };
    case "payment-under-review":
      return refused(PAYMENT_RECEIVED_MESSAGE);
    case "reuse": {
      const started = await provider.startCheckout({
        businessId: tenant.businessId,
        businessName: tenant.businessName,
        email: customer.user.email,
        plan: planned.plan,
        existingProviderSubscriptionId: decision.providerSubscriptionId,
        // The reused checkout's own frozen discount. Razorpay ignores it (the subscription is already on its
        // discounted plan), but a provider that works the amount out again, as the fake one does, would otherwise
        // ask for full price.
        discountAmountCents: planned.latest?.discountAmountCents ?? 0,
        bundledAddOnNetCents: planned.latest?.bundledAddOnNetCents ?? 0,
      });
      if (started.providerSubscriptionId !== decision.providerSubscriptionId) throw new CheckoutMismatchError();
      return { kind: "redirect", url: checkedUrl(started) };
    }
    case "create":
      return openNewCheckout(customer, provider, planned, null, now);
    case "replace": {
      // decideCheckout only replaces the newest subscription, so it is the one the decision saw.
      const stale = planned.latest;
      if (stale === null || stale.id !== decision.staleSubscriptionId) {
        throw new Error(`Checkout decided to replace ${decision.staleSubscriptionId}, which is not the newest subscription`);
      }
      return openNewCheckout(customer, provider, planned, stale, now);
    }
    default: {
      const unhandled: never = decision;
      throw new Error(`Unhandled checkout decision: ${JSON.stringify(unhandled)}`);
    }
  }
}
