import "server-only";

/* Ported from apps/platform lib/server/checkout.ts. The old Check and send payment is the checkout here too (startCheckoutFor). */

import { bundleKey, decideCheckout, type BillingProvider, type CheckoutDecision, type StartedCheckout } from "@brandbasket/billing";
import {
  BillingBusinessNotFoundError,
  consumeRateLimit,
  findActivePlan,
  findBillingState,
  findBusinessEntry,
  bundledNetCents,
  businessHasHadService,
  findBundledAddOnsForSubscription,
  findBusinessReferralCode,
  findLatestSubscriptionForBusiness,
  findOpenPaymentLinkForBusiness,
  findRedeemableReferralCode,
  isPackageOfferForfeited,
  type BillingInterval,
  lockBusinessForBilling,
  markPackageOfferForfeited,
  openCheckoutSubscription,
  paymentLinkState,
  withTenantScope,
  type NewBundledAddOn,
  type Plan,
  type PlanTier,
  type RateLimitRule,
  type Subscription,
} from "@brandbasket/db";
import { isSafeCheckoutUrl } from "../rules/checkout-url";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection, WEBSITE_ALONE, type ReactivationBasket } from "@brandbasket/shared/lib/billing/bundle";
import { BUILD_FEE_ADD_ON, planFirstPayment } from "@brandbasket/shared/lib/billing/first-payment";
import { setupFeeFor, type SetupFee } from "@brandbasket/shared/lib/billing/setup-fee";
import { isWebsiteKind, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { linkCustomPrices } from "@brandbasket/shared/lib/billing/deal";
import { adCreditCentsAtCheckout, packageLines, priceLinesFor } from "@brandbasket/shared/lib/billing/packages";
import { addMonthsUtc } from "@brandbasket/billing/term";
import { PAYMENT_RECEIVED_MESSAGE, REACTIVATE_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import { firstMissing, onboardingChecklist } from "@brandbasket/shared/lib/onboarding/checklist";
import { MEMBER_HOME } from "../rules/membership";
import { checklistInputFrom } from "@/features/checklist/rules-snapshot";
import { businessDetails } from "@brandbasket/shared/lib/site-config";
import { getBillingProvider } from "./billing";
import { billingDetailsMissing } from "./billing-details";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { missingProblem, readOnboardingSnapshot, type StepProblem } from "./onboarding";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { loadCarriedCode, loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { discountFrom, type AppliedDiscount } from "./referrals";
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
class CheckoutMismatchError extends Error {
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
// New wording (plan 63, decision D4): the owner approves it before release.
const CODE_NEEDS_A_PAID_SERVICE = "Your referral code can’t be used on a basket of first-month offer services only. Add a service that pays full price to use it.";
/** What Razorpay Checkout calls the upfront amount when it carries a build fee (plan 65). New copy: the owner approves it before release. */
const BUILD_FEE_ITEM_NAME = "Website build and first payment";
/** What Razorpay Checkout calls the upfront amount of a paid deal's payment 2 (plan 66). New copy: the owner approves it before release. */
const DEAL_BALANCE_ITEM_NAME = "Website balance and first payment";
// New wording (plan 65): the owner approves it before release. A code is refused with a yearly website build, as well as with first-month offer services only.
const CODE_REFUSED_MESSAGE = `${CODE_NEEDS_A_PAID_SERVICE} A yearly website build takes no code either: ask us about a deal discount instead.`;
const BILLING_DETAILS_NEEDED = "Add your billing details to pay. Your GST invoice is made out from them and cannot be changed once it is issued.";

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
  /** How often the new subscription is charged: the one chosen, or the one a lapse comes back on. Every amount above is for one cycle of it. */
  readonly interval: BillingInterval;
  /**
   * The first-month offer in this basket (plan 63), or null. The subscription is for the full monthly amount and starts on
   * `firstChargeAt`, a month from now; `firstPaymentCents` is taken upfront when the customer approves it.
   */
  readonly offer: { readonly firstPaymentCents: number; readonly firstChargeAt: Date } | null;
  /**
   * What was agreed for the website (plan 65): its kind, the build fee less the deal discount and the staff note, and the payment link it
   * came from. All null when the basket has no website or no fee is owed (a fee that is waived is still recorded, with its discount, so
   * the invoice can say so). Frozen onto the subscription when the checkout opens.
   */
  readonly deal: {
    readonly websiteKind: WebsiteKind | null;
    readonly setupFee: SetupFee | null;
    readonly note: string | null;
    readonly paymentLinkId: string | null;
    /** Plan 66: the advance a paid deal already received, or null (the balance is then net build price less this, paid with this checkout). */
    readonly advanceCents: number | null;
  };
}

/**
 * What a checkout may add to the basket the page named (plan 65): the kind of website the customer chose, and whether the list build
 * fee is owed when no payment link names one. A sign-up checkout owes it (decision D14); a website client invited by staff, who has
 * always had a free build, and a reactivation do not. A payment link bound to the business decides everything itself.
 */
export interface CheckoutDealOptions {
  readonly chosenKind: WebsiteKind;
  readonly chargeListFee: boolean;
}

const NO_FEE: CheckoutDealOptions = { chosenKind: "b2b", chargeListFee: false };

type DecisionStep =
  | { readonly kind: "planned"; readonly planned: PlannedCheckout }
  | { readonly kind: "code-refused" }
  | { readonly kind: "no-plan" }
  | { readonly kind: "no-services" }
  /** A paid deal (plan 66) whose website staff have not marked ready: the plan checkout is payment 2 and opens only once they have. */
  | { readonly kind: "deal-not-ready" };

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
 * Returns null when the check failed (another press, or tab, got there first), so the caller can look again.
 */
async function openNewCheckout(
  customer: GrantedCustomer,
  provider: BillingProvider,
  planned: PlannedCheckout,
  replacing: Subscription | null,
  now: Date,
): Promise<CheckoutOutcome | null> {
  const { user, tenant } = customer;
  const { discount } = planned;
  const discountAmountCents = discount?.amountCents ?? 0;
  const bundledAddOnNetCents = bundledNetCents(planned.bundle);
  // Razorpay charges a subscription its plan's amount, so a discount, or add-ons billed with the plan, is a plan of its own.
  // Made (or found) before anything is opened at the provider: if it cannot be made, nothing exists to clean up.
  let providerPlanId: string | undefined;
  try {
    providerPlanId = await ensureDiscountPlan(provider, planned.plan, discountAmountCents, bundledAddOnNetCents, planned.interval);
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
    billingInterval: planned.interval,
    discountAmountCents,
    bundledAddOnNetCents,
    ...(providerPlanId === undefined ? {} : { providerPlanId }),
    ...(planned.offer === null
      ? {}
      : {
          firstPayment: {
            amountCents: planned.offer.firstPaymentCents,
            startAt: planned.offer.firstChargeAt,
            ...(planned.deal.advanceCents !== null
              ? { label: DEAL_BALANCE_ITEM_NAME }
              : planned.deal.setupFee !== null && planned.deal.setupFee.netCents > 0
                ? { label: BUILD_FEE_ITEM_NAME }
                : {}),
          },
        }),
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
        billingInterval: planned.interval,
        referralCodeId: discount?.codeId ?? null,
        discountAmountCents: discount?.amountCents ?? 0,
        discountMonthsLeft: discount?.months ?? null,
        bundledAddOns: planned.bundle,
        adCreditCents: planned.adCreditCents,
        ...(planned.offer === null ? {} : { firstPaymentCents: planned.offer.firstPaymentCents, firstChargeAt: planned.offer.firstChargeAt }),
        websiteKind: planned.deal.websiteKind,
        setupFeeListCents: planned.deal.setupFee?.listCents ?? null,
        setupFeeDiscountCents: planned.deal.setupFee?.discountCents ?? null,
        setupFeeNote: planned.deal.note,
        setupFeeAdvanceCents: planned.deal.advanceCents,
        paymentLinkId: planned.deal.paymentLinkId,
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
    return null;
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
export async function startCheckoutFor(customer: GrantedCustomer, now: Date, interval: BillingInterval = "month"): Promise<CheckoutOutcome> {
  const { tenant } = customer;
  const appDb = getAppDb();

  const limit = await consumeRateLimit(appDb, `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  if (await billingDetailsMissing(customer)) return refused(BILLING_DETAILS_NEEDED);

  const snapshot = await withTenantScope(appDb, tenant, readOnboardingSnapshot);
  if (snapshot.project === null) return refused(NOTHING_TO_PAY_FOR);
  if (!snapshot.locked) {
    const missing = firstMissing(onboardingChecklist(checklistInputFrom(snapshot)));
    if (missing !== null) return { kind: "refused", problem: missingProblem(missing) };
  }

  // Already paid (another tab, say): Home, which leads on to whatever setup is left.
  return openPlanCheckout(customer, now, MEMBER_HOME, null, WEBSITE_ALONE, interval, NO_FEE);
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
  interval: BillingInterval = "month",
  chosenKind: WebsiteKind = "b2b",
): Promise<CheckoutOutcome> {
  const { tenant } = customer;
  const appDb = getAppDb();

  const limit = await consumeRateLimit(appDb, `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const entry = await withTenantScope(appDb, tenant, (tx) => findBusinessEntry(tx, tenant.businessId));
  if (entry?.kind !== "listing") return refused(ALREADY_A_MEMBER);
  if (await billingDetailsMissing(customer)) return refused(BILLING_DETAILS_NEEDED);

  return openPlanCheckout(customer, now, MEMBER_HOME, tier, readBundleSelection(services), interval, { chosenKind, chargeListFee: true });
}

/**
 * Plan 66, payment 2 of a paid deal: the balance of the build with the first period of every service, once staff have marked the website
 * ready. The business already has its project (paid at the advance), so there are no onboarding answers to check. The deal's link decides
 * the services, interval and every price; openPlanCheckout reads it under the lock and refuses a deal that is not ready.
 */
export async function startBalancePaymentFor(customer: GrantedCustomer, now: Date): Promise<CheckoutOutcome> {
  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${customer.tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);
  if (await billingDetailsMissing(customer)) return refused(BILLING_DETAILS_NEEDED);
  return openPlanCheckout(customer, now, MEMBER_HOME, null, WEBSITE_ALONE, "month", NO_FEE);
}

/**
 * Reactivate on Billing (docs/superpowers/specs/2026-10-09-reactivation-design.md): a business that paid before and has
 * lapsed opens a checkout, and its lapsed subscription is replaced. A lapse (a failed payment, a revoked mandate) reopens the
 * basket it lapsed with (loadReactivationBasket) and ignores `chosen`; it keeps its code, repriced on that basket, for the months
 * the code has left (loadCarriedCode). A customer who cancelled the plan themselves chooses their services again: `chosen`, every
 * one at its own price and with nothing carried (docs/plans/18-platform-owner-decisions.md, decisions 4 and 6); an empty or
 * unknown set is refused.
 * Checked on the server, whatever the page showed: the same rate limit as any checkout, then that the business really
 * has lapsed. A paid-up one is sent to Billing, and one that never paid has nothing to restart. Its project is live,
 * so there is no onboarding to check.
 */
export async function startReactivationFor(
  customer: GrantedCustomer,
  now: Date,
  chosen: readonly MonthlyAddOnId[] = [],
  interval: BillingInterval = "month",
): Promise<CheckoutOutcome> {
  const { tenant, billing } = customer;
  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);
  if (billing.status === "paid") return { kind: "redirect", url: REACTIVATE_HREF };
  if (billing.status !== "lapsed") return refused(NOTHING_TO_PAY_FOR);
  return openPlanCheckout(customer, now, REACTIVATE_HREF, null, readBundleSelection(chosen), interval, NO_FEE);
}

/**
 * What a checkout was opened for: the services, what they add up to and the ad credit it grants. The same services at another
 * price (the package offer given up since, an ad credit that no longer applies) are another checkout, never the old one reused.
 */
function basketKey(
  addOnIds: readonly string[],
  netCents: number,
  adCreditCents: number,
  interval: BillingInterval,
  firstPaymentCents: number | null,
  deal: { readonly feeNetCents: number | null; readonly paymentLinkId: string | null },
): string {
  // The fee and the link are part of what a checkout is: the provider's subscription froze the amount, so another deal is another
  // checkout. The kind needs no entry of its own: it already sets the website line's price, which `netCents` holds.
  return `${bundleKey(addOnIds)}|${netCents}|${adCreditCents}|${interval}|${firstPaymentCents ?? ""}|${deal.feeNetCents ?? ""}|${deal.paymentLinkId ?? ""}`;
}

/**
 * Whether the business's newest checkout is a first-month offer the customer has paid but whose payment is not recorded yet (its
 * webhook is late or lost; apps/platform records it within minutes). Such a checkout must not be replaced: replacing it would cancel
 * the subscription the customer just paid for. Read before the decision, unlocked, because the provider is asked and no transaction
 * may be open for that. `unknown` when the provider cannot be asked: nothing is opened then, so nothing paid is ever replaced.
 */
async function unrecordedOfferPayment(provider: BillingProvider, businessId: string): Promise<"paid" | "none" | "unknown"> {
  const latest = await findLatestSubscriptionForBusiness(getStaffDb(), businessId);
  if (latest === null || latest.firstPaymentCents === null || latest.activatedAt !== null || latest.status === "cancelled") return "none";
  if (latest.provider !== provider.name) return "none";
  try {
    return (await provider.findUpfrontPayment(latest.providerSubscriptionId)) === null ? "none" : "paid";
  } catch (error) {
    logBillingEvent("error", "first-payment-check-failed", {
      businessId,
      subscriptionId: latest.id,
      provider: provider.name,
      providerSubscriptionId: latest.providerSubscriptionId,
      ...describeError(error),
    });
    return "unknown";
  }
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
 * nothing is refused before anything is read (a lapsed business may pass none, as its basket is not chosen, and is checked
 * under the lock). A business that has paid before and lapsed is reactivating and buys the basket it lapsed with instead
 * (loadReactivationBasket), whatever `chosen` says, unless it cancelled the plan itself: then it buys `chosen`, at list.
 * A code is priced against the basket's package net, so it comes off once, after the package offer.
 *
 * Pressing Pay twice at once opens two subscriptions at the provider, and only the first to record stays. The other
 * cancels its own and looks again (`lookAgain`, once), which now finds the first press's checkout and sends the customer
 * to it, instead of telling them something changed. Only if the business moves again is the customer asked to retry.
 */
async function openPlanCheckout(
  customer: GrantedCustomer,
  now: Date,
  paidHref: string,
  tier: PlanTier | null,
  chosen: readonly MonthlyAddOnId[],
  chosenInterval: BillingInterval,
  options: CheckoutDealOptions = NO_FEE,
  lookAgain: boolean = true,
): Promise<CheckoutOutcome> {
  if (chosen.length === 0 && customer.billing.status !== "lapsed") return refused(NO_SERVICES);
  const { tenant } = customer;
  const provider = getBillingProvider();
  const changedMeanwhile = async (): Promise<CheckoutOutcome> =>
    lookAgain ? openPlanCheckout(customer, now, paidHref, tier, chosen, chosenInterval, options, false) : refused(CHANGED_MEANWHILE);
  const unrecorded = await unrecordedOfferPayment(provider, tenant.businessId);
  if (unrecorded === "paid") return refused(PAYMENT_RECEIVED_MESSAGE);
  if (unrecorded === "unknown") return refused(PAYMENT_UNAVAILABLE);
  const first = await getStaffDb().transaction(async (tx): Promise<DecisionStep> => {
    await lockBusinessForBilling(tx, tenant.businessId);
    const state = await findBillingState(tx, tenant.businessId);
    if (state === null) throw new BillingBusinessNotFoundError(tenant.businessId);
    // The plan the business is on or chose: Managed Website, in the business's currency.
    const plan = await findActivePlan(tx, state.currency, tier ?? state.tier);
    if (plan === null) return { kind: "no-plan" };
    // Re-validated here, under the lock, rather than trusted from when the customer pressed Apply: a code can be
    // deactivated, expire or hit its cap in between, and the amount frozen on the subscription must be the one
    // that was true at the moment the checkout opened. A business that has paid before is reactivating, which takes no
    // code of its own (docs/superpowers/specs/2026-10-09-reactivation-design.md): a lapse keeps the code it had instead.
    const applied = state.hasEverPaid ? null : await findBusinessReferralCode(tx, tenant.businessId);
    const redeemable =
      applied === null
        ? null
        : await findRedeemableReferralCode(tx, { code: applied.code, currency: state.currency, now });
    // The plan row is the terms at a price of 0: every service, the website included, is a line. A business that has paid
    // before is reactivating: the basket it lapsed with, read before the lapsed subscription is replaced and ends its lines.
    const reactivation = state.hasEverPaid ? await loadReactivationBasket(tx, tenant.businessId) : null;
    // A lapse (not the client's own cancel) keeps its code with the months it has left, even if the code was retired since.
    const carried = reactivation === null ? null : await loadCarriedCode(tx, tenant.businessId, reactivation);
    // The client's own cancel ended the package: they chose their services again. A lapse comes back as it was.
    // Plan 65: a staff payment link bound to this business decides the deal. Read under the lock, so a link cancelled or paid a moment
    // ago is never honoured. A reactivation takes no link.
    const link = reactivation === null ? await findOpenPaymentLinkForBusiness(tx, tenant.businessId, now) : null;
    if (link !== null && link.currency !== plan.currency) return { kind: "no-plan" };
    // Plan 66: a paid deal pays its balance here, once staff have marked the website ready. Before that the build is not owed.
    let dealNetCents: number | null = null;
    let dealAdvanceCents: number | null = null;
    if (link?.dealType === "paid") {
      if (paymentLinkState(link, now) !== "balance_due" || link.setupFeeListCents === null || link.advanceCents === null) return { kind: "deal-not-ready" };
      dealNetCents = link.setupFeeListCents - (link.setupFeeDiscountCents ?? 0);
      dealAdvanceCents = link.advanceCents;
      if (dealNetCents < dealAdvanceCents) return { kind: "deal-not-ready" };
    }
    const basket = reactivation === null || reactivation.cancelled ? chosen : reactivation.services;
    const services = link === null ? basket : readBundleSelection(link.services);
    if (services.length === 0) return { kind: "no-services" };
    const forfeited = reactivation?.forfeited ?? (await isPackageOfferForfeited(tx, tenant.businessId));
    // A lapse comes back on the interval it had; a first checkout, or a client who cancelled and chose again, on the one chosen.
    const pickedInterval = reactivation === null || reactivation.cancelled ? chosenInterval : reactivation.billingInterval;
    const interval: BillingInterval = link === null ? pickedInterval : link.billingInterval === "year" ? "year" : "month";
    const websiteKind: WebsiteKind = link?.websiteKind != null && isWebsiteKind(link.websiteKind) ? link.websiteKind : options.chosenKind;
    // Plan 66: a link's custom prices (a free deal's, or a paid deal's recurring ones) replace the catalogue's, with no offer discount.
    const pricedLines =
      link === null ? packageLines({ services, forfeited }, plan.currency, interval, websiteKind) : priceLinesFor({ services, forfeited }, plan.currency, interval, websiteKind, linkCustomPrices(link));
    const fullBundle: readonly NewBundledAddOn[] = pricedLines.map((line) => ({
      addOn: line.addOn,
      listAmountCents: line.listCents,
      offerDiscountAmountCents: line.offerCents,
      netAmountCents: line.netCents,
      taxRateBasisPoints: plan.taxRateBasisPoints,
    }));
    // The code comes off the basket's package net, once: the lines just priced, less their package discount.
    const code = redeemable ?? carried?.code ?? null;
    const priced = code === null ? null : discountFrom(code, { currency: plan.currency, netCents: bundledNetCents(fullBundle), interval });
    // A yearly basket's code covers its first payment only (discountFrom); a lapse's carried months are a monthly code's.
    const discount = priced !== null && carried !== null && interval === "month" ? { ...priced, months: carried.monthsLeft } : priced;
    // The first-month offer (plan 63): Social Media and Paid Ads for a business that never had them. Under the lock, so two presses
    // cannot both take it. A business that has paid for a service before, on any subscription, takes it at its price.
    // A business coming back after a lapse or a cancel pays its first month in full: the offer is for a first purchase (plan 63).
    const hadService = new Map<string, boolean>();
    if (reactivation === null) {
      for (const line of pricedLines) hadService.set(line.addOn, await businessHasHadService(tx, tenant.businessId, line.addOn));
    }
    // The build fee (plan 65): owed for a first purchase of Website Management by a sign-up checkout, or as a payment link states it. A
    // fee waived in full is still recorded, so the invoice can say so, but takes no free month (planFirstPayment: no fee, ordinary).
    const owesFee = pricedLines.some((line) => line.addOn === BUILD_FEE_ADD_ON) && reactivation === null && hadService.get(BUILD_FEE_ADD_ON) === false;
    // A link owes no build here: a free link has none, and a paid one is refused above (its build is paid as the advance and the balance,
    // plan 66). The charge of the list fee with the first payment belongs to a sign-up checkout only.
    const signUpFee: SetupFee | null = owesFee && link === null && options.chargeListFee ? setupFeeFor(websiteKind, plan.currency, 0) : null;
    // The deal's build is recorded on the subscription (list, discount, advance) so the invoice can split it, but it is the balance that
    // planFirstPayment adds, never a fee.
    const setupFee: SetupFee | null =
      dealNetCents !== null && link?.setupFeeListCents != null
        ? { listCents: link.setupFeeListCents, discountCents: link.setupFeeDiscountCents ?? 0, netCents: dealNetCents }
        : signUpFee;
    const firstPayment = planFirstPayment({
      lines: pricedLines.map((line) => ({ addOn: line.addOn, netCents: line.netCents, hadService: hadService.get(line.addOn) ?? true })),
      interval,
      provider: provider.name,
      currency: plan.currency,
      discountCents: discount?.amountCents ?? 0,
      ...(dealNetCents !== null && dealAdvanceCents !== null
        ? { dealBalanceCents: dealNetCents - dealAdvanceCents }
        : signUpFee === null
          ? {}
          : { setupFeeNetCents: signUpFee.netCents }),
    });
    if (firstPayment.kind === "code-refused") return { kind: "code-refused" };
    const offer = firstPayment.kind === "offer" ? { firstPaymentCents: firstPayment.firstPaymentCents, firstChargeAt: addMonthsUtc(now, firstPayment.firstChargeMonths) } : null;
    const hasWebsite = pricedLines.some((line) => line.addOn === BUILD_FEE_ADD_ON);
    const deal: PlannedCheckout["deal"] = {
      websiteKind: hasWebsite ? websiteKind : null,
      setupFee,
      note: setupFee === null ? null : (link?.setupFeeNote ?? null),
      paymentLinkId: link?.id ?? null,
      advanceCents: dealAdvanceCents,
    };
    const bundle: readonly NewBundledAddOn[] =
      firstPayment.kind === "offer" ? fullBundle.map((line) => ({ ...line, trialPriceCents: firstPayment.trialPriceByAddOn[line.addOn] ?? null })) : fullBundle;
    // Ad credit is for services bought together at the first purchase. A reactivation grants none and keeps what the lapsed
    // subscription had.
    const adCreditCents = reactivation?.adCreditCents ?? adCreditCentsAtCheckout({ services, forfeited, hasEverPaid: false }, plan.currency);
    const latestPending = state.subscription === null ? [] : (await findBundledAddOnsForSubscription(tx, state.subscription.id)).filter((row) => row.status === "pending");
    const decision = decideCheckout(
      state.subscription === null
        ? null
        : {
            ...state.subscription,
            bundleKey: basketKey(
              latestPending.map((row) => row.addOn),
              state.subscription.bundledAddOnNetCents,
              state.subscription.adCreditCents,
              state.subscription.billingInterval,
              state.subscription.firstPaymentCents,
              {
                feeNetCents: state.subscription.setupFeeListCents === null ? null : state.subscription.setupFeeListCents - (state.subscription.setupFeeDiscountCents ?? 0),
                paymentLinkId: state.subscription.paymentLinkId,
              },
            ),
          },
      {
        planId: plan.id,
        provider: provider.name,
        referralCodeId: discount?.codeId ?? null,
        bundleKey: basketKey(bundle.map((item) => item.addOn), bundle.reduce((total, item) => total + item.netAmountCents, 0), adCreditCents, interval, offer?.firstPaymentCents ?? null, { feeNetCents: setupFee?.netCents ?? null, paymentLinkId: deal.paymentLinkId }),
      },
      now,
      state,
    );
    return { kind: "planned", planned: { plan, decision, latest: state.subscription, discount, bundle, adCreditCents, reactivation, interval, offer, deal } };
  });
  if (first.kind === "no-plan") return refused(NO_PLAN);
  if (first.kind === "no-services") return refused(NO_SERVICES);
  if (first.kind === "deal-not-ready") return refused(NOTHING_TO_PAY_FOR);
  if (first.kind === "code-refused") return refused(CODE_REFUSED_MESSAGE);

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
        ...(planned.latest?.firstPaymentCents != null && planned.latest.firstChargeAt !== null
          ? { firstPayment: { amountCents: planned.latest.firstPaymentCents, startAt: planned.latest.firstChargeAt } }
          : {}),
      });
      if (started.providerSubscriptionId !== decision.providerSubscriptionId) throw new CheckoutMismatchError();
      return { kind: "redirect", url: checkedUrl(started) };
    }
    case "create":
      return (await openNewCheckout(customer, provider, planned, null, now)) ?? changedMeanwhile();
    case "replace": {
      // decideCheckout only replaces the newest subscription, so it is the one the decision saw.
      const stale = planned.latest;
      if (stale === null || stale.id !== decision.staleSubscriptionId) {
        throw new Error(`Checkout decided to replace ${decision.staleSubscriptionId}, which is not the newest subscription`);
      }
      return (await openNewCheckout(customer, provider, planned, stale, now)) ?? changedMeanwhile();
    }
    default: {
      const unhandled: never = decision;
      throw new Error(`Unhandled checkout decision: ${JSON.stringify(unhandled)}`);
    }
  }
}
