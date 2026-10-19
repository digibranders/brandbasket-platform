import "server-only";
import { discountCentsFor, hasBillingAccess, isChargeableDiscount, type BillingProvider } from "@brandbasket/billing";
import {
  completePlanUpgradeAtRenewal,
  findActivePlan,
  findBillingState,
  findChargeForBusiness,
  findPlanById,
  findPlanUpgradeById,
  findPlanUpgradeInFlight,
  findReferralCodeById,
  findSubscriptionById,
  flagPaymentForAttention,
  lockBusinessForBilling,
  markPlanUpgradeScheduled,
  openPlanUpgrade,
  PlanUpgradeNotPossibleError,
  type BillingState,
  type Database,
  type Plan,
  type PlanUpgrade,
  type PlanUpgradeSource,
  type ReferralCode,
  type ScopedTransaction,
} from "@brandbasket/db";
import { billingPeriodProgress } from "../lib/billing/period";
import {
  quoteUpgrade,
  upgradeBlock,
  upgradeChargeDescription,
  type UpgradeBlock,
  type UpgradeQuote,
  type UpgradeRefusal,
} from "../lib/billing/upgrade";
import { describeError, logBillingEvent } from "./billing-log";

/*
 * Moving a Care client up to Premium, server side (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md).
 * Shared by the dashboard (the customer pays) and the staff console (staff move a client with nothing to take), so both
 * work out the same quote, apply the same rules and finish the same way. The database transitions are in
 * @brandbasket/db (queries/plan-upgrades.ts); this decides what to ask of them.
 */

/** What happens to the code on the subscription when it moves to Premium. */
export type CodeCarryOver =
  | { readonly kind: "none" }
  | { readonly kind: "carried"; readonly code: string; readonly amountCents: number }
  | { readonly kind: "dropped"; readonly code: string };

/**
 * The code a subscription was opened with, re-worked against Premium's price. It carries over while staff have not
 * turned it off (a code someone already redeemed is not held to its cap or expiry again); if it is off, or would leave
 * nothing to charge on Premium, Premium is at full price and the page says so.
 */
export function codeCarryOver(code: ReferralCode | null, premium: Plan): CodeCarryOver {
  if (code === null) return { kind: "none" };
  if (!code.active || code.currency !== premium.currency) return { kind: "dropped", code: code.code };
  if (code.discount === null) return { kind: "carried", code: code.code, amountCents: 0 };
  const amountCents = discountCentsFor(code.discount, premium.recurringAmountCents);
  if (!isChargeableDiscount(premium.recurringAmountCents, amountCents)) return { kind: "dropped", code: code.code };
  return { kind: "carried", code: code.code, amountCents };
}

/** What a business sees about moving up, for the page and the staff console. */
export type UpgradeAssessment =
  /** It cannot move up on its own, and why. */
  | { readonly kind: "blocked"; readonly reason: UpgradeBlock }
  /** It could, but not now: Premium has no price on sale, the provider is not ready, or the quote cannot be made. */
  | { readonly kind: "unavailable"; readonly reason: "no-premium-plan" | "provider-not-ready" | UpgradeRefusal }
  | {
      readonly kind: "offer";
      readonly quote: UpgradeQuote;
      readonly care: Plan;
      readonly premium: Plan;
      readonly carry: CodeCarryOver;
      /** A stay offer on the Care subscription ends with the move, which the page says. */
      readonly retentionEnds: boolean;
      /** The Care price the customer is on, after the discount, for the page's comparison. */
      readonly fromDiscountCents: number;
      readonly toDiscountCents: number;
      readonly periodStart: Date;
      readonly periodEnd: Date;
    };

export interface AssessmentInput {
  /** The business's billing state as findBillingState reads it, before any move is paid for. */
  readonly state: BillingState;
  /** Premium's plan on sale in the business's currency, or null. */
  readonly premium: Plan | null;
  /** The code the subscription was opened with, or null. */
  readonly code: ReferralCode | null;
  readonly providerName: BillingProvider["name"];
  readonly now: Date;
  /**
   * Block reasons to look past: staff may move a bank-transfer client, which has no recurring billing at a provider, so
   * the provider checks do not apply to a manual subscription.
   */
  readonly allow?: readonly UpgradeBlock[];
}

/**
 * Whether a business can move up now, and at what price. Pure: every input is a read the caller has made, so the page
 * and the transaction that opens the move (which reads again under the lock) use the very same rules.
 */
export function assessUpgrade(input: AssessmentInput): UpgradeAssessment {
  const { state, premium, code, now } = input;
  const subscription = state.subscription;
  const block = upgradeBlock({
    tier: state.tier,
    hasSubscription: subscription !== null,
    provider: subscription?.provider ?? null,
    status: subscription?.status ?? null,
    hasAccess: hasBillingAccess(subscription, now),
    hasEverPaid: state.hasEverPaid,
    cancelRequested: subscription?.cancelRequestedAt != null,
    paymentUnderReview: state.paymentUnderReview,
    upgradePaid: state.upgradePaid,
  });
  if (block !== null && input.allow?.includes(block) !== true) return { kind: "blocked", reason: block };

  const care = state.plan;
  if (subscription === null || care === null || subscription.paidThroughAt === null) return { kind: "blocked", reason: "unpaid" };
  if (premium === null) return { kind: "unavailable", reason: "no-premium-plan" };
  // The subscription lives at one provider; the money moves through it, so it must be the one in use, and Razorpay
  // must have a plan to bill Premium on (set when staff price Premium).
  const billedByProvider = subscription.provider !== "manual";
  if (billedByProvider && subscription.provider !== input.providerName) return { kind: "unavailable", reason: "provider-not-ready" };
  if (billedByProvider && input.providerName === "razorpay" && premium.providerPlanId === null) {
    return { kind: "unavailable", reason: "provider-not-ready" };
  }
  const carry = codeCarryOver(code, premium);
  const toDiscountCents = carry.kind === "carried" ? carry.amountCents : 0;

  const period = billingPeriodProgress(subscription, now);
  if (period === null) return { kind: "unavailable", reason: "renewal-due" };
  const quote = quoteUpgrade({
    from: care,
    to: premium,
    fromDiscountCents: subscription.discountAmountCents,
    toDiscountCents,
    period: { start: period.start, end: subscription.paidThroughAt },
    now,
  });
  if (quote.kind === "refused") return { kind: "unavailable", reason: quote.reason };
  return {
    kind: "offer",
    quote,
    care,
    premium,
    carry,
    retentionEnds: subscription.retentionDiscountCents > 0,
    fromDiscountCents: subscription.discountAmountCents,
    toDiscountCents,
    periodStart: period.start,
    periodEnd: subscription.paidThroughAt,
  };
}

/** The reads an assessment needs, on any connection that can see the business. */
export async function readAssessmentInput(
  db: Database | ScopedTransaction,
  businessId: string,
  providerName: BillingProvider["name"],
  now: Date,
): Promise<AssessmentInput | null> {
  const state = await findBillingState(db, businessId);
  if (state === null) return null;
  const premium = await findActivePlan(db, state.currency, "premium");
  const codeId = state.subscription?.referralCodeId ?? null;
  const code = codeId === null ? null : await findReferralCodeById(db, codeId);
  return { state, premium, code, providerName, now };
}

/** What asking to move up came to. */
export type UpgradeStart =
  /** A charge to pay: send the customer to pay it. */
  | { readonly kind: "pay"; readonly chargeId: string; readonly upgrade: PlanUpgrade }
  /** Nothing to take: the move is applied, and `upgrade` is paid, waiting for the provider step. */
  | { readonly kind: "applied"; readonly upgrade: PlanUpgrade }
  | { readonly kind: "refused"; readonly assessment: Exclude<UpgradeAssessment, { kind: "offer" }> }
  /** The subscription changed between the assessment and the lock: ask again. */
  | { readonly kind: "changed" };

export interface StartUpgradeInput {
  readonly businessId: string;
  readonly source: PlanUpgradeSource;
  readonly staffId: string | null;
  readonly providerName: BillingProvider["name"];
  readonly now: Date;
  /**
   * Block reasons staff may move a client past (a bank-transfer client has no recurring billing to change, so only
   * staff move it). Empty for a customer.
   */
  readonly allowBlocks?: readonly UpgradeBlock[];
  /** Staff move a client with nothing to take; the customer pays the difference. */
  readonly noCharge?: boolean;
}

/**
 * Opens the move, in one transaction under the business's billing lock, from a fresh reading of its billing: the
 * assessment the page showed is never trusted. An open move whose quote is still the same is reused rather than
 * replaced, so pressing Upgrade twice finds the same charge.
 */
export async function startUpgrade(staffDb: Database, input: StartUpgradeInput): Promise<UpgradeStart> {
  try {
    return await staffDb.transaction(async (tx): Promise<UpgradeStart> => {
      await lockBusinessForBilling(tx, input.businessId);
      const read = await readAssessmentInput(tx, input.businessId, input.providerName, input.now);
      if (read === null) throw new PlanUpgradeNotPossibleError("no-subscription");
      const assessment = assessUpgrade({ ...read, allow: input.allowBlocks ?? [] });
      if (assessment.kind !== "offer") return { kind: "refused", assessment };

      const subscription = read.state.subscription;
      if (subscription === null) return { kind: "refused", assessment: { kind: "blocked", reason: "unpaid" } };
      const free = input.noCharge === true || assessment.quote.free;
      const existing = await findPlanUpgradeInFlight(tx, input.businessId);
      if (!free && existing !== null && existing.status === "open" && sameQuote(existing, assessment, subscription.id) && existing.chargeId !== null) {
        const charge = await findChargeForBusiness(tx, input.businessId, existing.chargeId);
        if (charge !== null && charge.status === "open") return { kind: "pay", chargeId: existing.chargeId, upgrade: existing };
      }

      const opened = await openPlanUpgrade(tx, {
        businessId: input.businessId,
        subscriptionId: subscription.id,
        fromPlanId: assessment.care.id,
        toPlanId: assessment.premium.id,
        fromDiscountAmountCents: assessment.fromDiscountCents,
        toDiscountAmountCents: assessment.toDiscountCents,
        periodEnd: assessment.periodEnd,
        netDifferenceCents: free ? 0 : assessment.quote.netDifferenceCents,
        chargeCents: free ? 0 : assessment.quote.chargeCents,
        taxRateBasisPoints: assessment.premium.taxRateBasisPoints,
        currency: assessment.premium.currency,
        description: upgradeChargeDescription(assessment.quote.daysLeft),
        source: input.source,
        staffId: input.staffId,
        now: input.now,
      });
      return opened.chargeId === null
        ? { kind: "applied", upgrade: opened.upgrade }
        : { kind: "pay", chargeId: opened.chargeId, upgrade: opened.upgrade };
    });
  } catch (error) {
    if (error instanceof PlanUpgradeNotPossibleError) return { kind: "changed" };
    throw error;
  }
}

function sameQuote(upgrade: PlanUpgrade, offer: Extract<UpgradeAssessment, { kind: "offer" }>, subscriptionId: string): boolean {
  return (
    upgrade.subscriptionId === subscriptionId &&
    upgrade.fromPlanId === offer.care.id &&
    upgrade.toPlanId === offer.premium.id &&
    upgrade.fromDiscountAmountCents === offer.fromDiscountCents &&
    upgrade.toDiscountAmountCents === offer.toDiscountCents &&
    upgrade.periodEnd.getTime() === offer.periodEnd.getTime() &&
    upgrade.chargeCents === offer.quote.chargeCents &&
    upgrade.netDifferenceCents === offer.quote.netDifferenceCents
  );
}

/** What the provider step came to. */
export type UpgradeFinish =
  /** The provider will bill Premium from the next renewal. */
  | { readonly kind: "scheduled" }
  /** A bank-transfer subscription has no provider: its plan was switched at once. */
  | { readonly kind: "completed" }
  /** There is no paid upgrade waiting for it (already scheduled, completed, cancelled, or never paid). */
  | { readonly kind: "nothing" }
  /** The provider would not do it. The client has Premium; staff finish it from the client page. */
  | { readonly kind: "failed"; readonly message: string };

export interface FinishUpgradeDeps {
  readonly staffDb: Database;
  readonly provider: BillingProvider;
  /** The provider plan a discounted subscription runs on, made when first needed (apps/platform/lib/server/discount-plans.ts). */
  readonly ensureDiscountPlan: (provider: BillingProvider, plan: Plan, discountAmountCents: number) => Promise<string | undefined>;
}

/**
 * The step after the money: tells the provider to bill Premium from the next renewal, and records that it did. Runs
 * after the payment's transaction has committed, never inside it (it is a call over the network); the client already
 * has Premium whatever happens here. Safe to run again: only an upgrade that is `paid` is acted on, so a redelivered
 * webhook, a staff retry and the first attempt cannot move the provider twice or disagree.
 *
 * A failure is logged and, when there is a payment behind the upgrade, flags that payment for staff.
 */
export async function finishUpgradeAtProvider(deps: FinishUpgradeDeps, upgradeId: string, now: Date): Promise<UpgradeFinish> {
  const { staffDb, provider } = deps;
  const upgrade = await findPlanUpgradeById(staffDb, upgradeId);
  if (upgrade === null || upgrade.status !== "paid") return { kind: "nothing" };
  const subscription = await findSubscriptionById(staffDb, upgrade.subscriptionId);
  const premium = await findPlanById(staffDb, upgrade.toPlanId);
  const fields = {
    businessId: upgrade.businessId,
    subscriptionId: upgrade.subscriptionId,
    provider: subscription?.provider ?? provider.name,
    upgradeId: upgrade.id,
  };
  if (subscription === null || premium === null) {
    logBillingEvent("error", "upgrade-provider-failed", { ...fields, errorName: "UpgradeRowsMissing", errorMessage: "The subscription or Premium plan could not be read." });
    return { kind: "failed", message: "The subscription or the Premium plan could not be read." };
  }

  // Paid by bank transfer: there is no provider billing it, so the plan changes now.
  if (subscription.provider === "manual") {
    await staffDb.transaction(async (tx) => {
      await lockBusinessForBilling(tx, upgrade.businessId);
      await completePlanUpgradeAtRenewal(tx, { subscriptionId: subscription.id, now });
    });
    return { kind: "completed" };
  }

  try {
    if (subscription.provider !== provider.name) throw new Error(`The subscription belongs to ${subscription.provider}, but ${provider.name} is configured.`);
    const providerPlanId =
      upgrade.toDiscountAmountCents > 0 ? await deps.ensureDiscountPlan(provider, premium, upgrade.toDiscountAmountCents) : (premium.providerPlanId ?? undefined);
    // The fake provider needs no plan of its own; Razorpay does, and without one there is nothing to move to.
    if (providerPlanId === undefined && provider.name === "razorpay") throw new Error("Premium has no Razorpay plan to bill.");
    await provider.changeSubscriptionPlanAtPeriodEnd(subscription.providerSubscriptionId, providerPlanId ?? "");
    await markPlanUpgradeScheduled(staffDb, { upgradeId: upgrade.id, providerPlanId: providerPlanId ?? null, now });
    return { kind: "scheduled" };
  } catch (error) {
    logBillingEvent("error", "upgrade-provider-failed", { ...fields, ...describeError(error) });
    if (upgrade.chargeId !== null) {
      const charge = await findChargeForBusiness(staffDb, upgrade.businessId, upgrade.chargeId);
      if (charge?.paymentId != null) {
        await flagPaymentForAttention(staffDb, {
          paymentId: charge.paymentId,
          businessId: upgrade.businessId,
          reason: "upgrade_provider_pending",
          now,
        });
      }
    }
    return { kind: "failed", message: "The payment provider did not accept the change. The client already has Premium." };
  }
}
