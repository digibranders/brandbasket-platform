import type { BillingProviderName, Plan, PlanTier, SubscriptionStatus } from "@fynix/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@fynix/billing/tax";
import type { PeriodProgress } from "./period";

/*
 * Moving up from Care to Premium on the same subscription (docs/superpowers/specs/2026-10-08-care-to-premium-
 * upgrade-design.md). Pure, so the page, the server and the tests share one set of rules.
 */

/** Less than this is left of the paid month: the renewal is about to be taken, so the move waits for it. */
export const MIN_UPGRADE_REMAINING_MS = 60 * 60 * 1000;

/** The smallest amount Razorpay will take as an order: ₹1, in paise. Anything under it is applied with no payment. */
export const MIN_ONLINE_CHARGE_CENTS = 100;

/** Why a business cannot move up on its own, in words the page can look up. Null means it can. */
export type UpgradeBlock =
  /** It is Premium already (or is being moved there). */
  | "already-premium"
  /** An upgrade has been paid for and is waiting for the renewal. */
  | "already-moving"
  /** Paid by bank transfer: there is no recurring billing to change, so staff move it. */
  | "manual-billing"
  /** It has asked to leave, or its account is closing. */
  | "ending"
  /** The provider could not take its last renewal, or it has not paid at all. */
  | "payment-failing"
  /** It paid once and has lapsed: reactivation is the team's. */
  | "lapsed"
  /** It has not paid for anything yet. */
  | "unpaid"
  /** Money arrived that bought nothing and staff have not dealt with it. */
  | "under-review";

export interface UpgradeStanding {
  readonly tier: PlanTier;
  readonly hasSubscription: boolean;
  readonly provider: BillingProviderName | null;
  readonly status: SubscriptionStatus | null;
  readonly hasAccess: boolean;
  readonly hasEverPaid: boolean;
  readonly cancelRequested: boolean;
  readonly paymentUnderReview: boolean;
  /** An upgrade is paid for and the subscription has not yet renewed on the new plan. */
  readonly upgradePaid: boolean;
}

/** Whether a Care client may move up now, and if not, the first reason why. */
export function upgradeBlock(standing: UpgradeStanding): UpgradeBlock | null {
  if (standing.upgradePaid) return "already-moving";
  if (standing.tier !== "care") return "already-premium";
  if (!standing.hasSubscription || standing.status === null || standing.provider === null) return "unpaid";
  if (standing.paymentUnderReview) return "under-review";
  if (!standing.hasAccess) return standing.hasEverPaid ? "lapsed" : "unpaid";
  if (standing.cancelRequested || standing.status === "cancelled") return "ending";
  if (standing.status !== "active") return "payment-failing";
  if (standing.provider === "manual") return "manual-billing";
  return null;
}

type UpgradePlan = Pick<Plan, "tier" | "currency" | "recurringAmountCents" | "taxRateBasisPoints">;

export interface UpgradeQuoteInput {
  /** The plan the subscription is billed on now (Care). */
  readonly from: UpgradePlan;
  /** The plan it moves to (Premium), at the price on sale now. */
  readonly to: UpgradePlan;
  /** What the subscription's discount takes off `from`'s net monthly price. */
  readonly fromDiscountCents: number;
  /** What the discount that carries over takes off `to`'s net monthly price. */
  readonly toDiscountCents: number;
  /** The month the customer has paid for. */
  readonly period: Pick<PeriodProgress, "start" | "end">;
  readonly now: Date;
}

export type UpgradeRefusal =
  /** The two plans are in different currencies. */
  | "different-currency"
  /** The two plans carry different tax, so a single charge cannot be worked out. */
  | "different-tax"
  /** After discounts Premium is not dearer than Care for this customer. */
  | "not-an-upgrade"
  /** The paid month is over or nearly over: the renewal is due. */
  | "renewal-due";

export interface UpgradeQuote {
  readonly kind: "quote";
  /** What is worked out for the days left, before tax. */
  readonly netDifferenceCents: number;
  /** What is taken now, tax included. Zero when there is nothing to take. */
  readonly chargeCents: number;
  /** True when the charge is too small for the provider to take: the move is applied with no payment. */
  readonly free: boolean;
  /** What each renewal takes from then on, tax included, after the discount that carries over. */
  readonly nextRenewalCents: number;
  readonly periodEnd: Date;
  readonly daysLeft: number;
  readonly periodDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * `amount * share / divisor`, rounded half up. Whole numbers throughout: amounts are paise and the share is a count of
 * days, so the product is far inside what a number holds exactly (checked), and no float ever rounds money.
 */
function shareOf(amount: number, share: number, divisor: number): number {
  const product = amount * share;
  if (!Number.isSafeInteger(product * 2 + divisor)) throw new RangeError("An upgrade's share is too large to work out exactly");
  return Math.floor((product * 2 + divisor) / (divisor * 2));
}

/**
 * What a Care client pays today to be Premium for the rest of the month they have paid for: the difference between
 * the two plans' monthly prices (each after its own discount) for the share of the month that is left, with the
 * plan's tax on top. Premium's full price is then taken at the next renewal.
 */
export function quoteUpgrade(input: UpgradeQuoteInput): UpgradeQuote | { readonly kind: "refused"; readonly reason: UpgradeRefusal } {
  const { from, to, period, now } = input;
  if (from.currency !== to.currency) return { kind: "refused", reason: "different-currency" };
  if (from.taxRateBasisPoints !== to.taxRateBasisPoints) return { kind: "refused", reason: "different-tax" };

  const remainingMs = period.end.getTime() - now.getTime();
  const totalMs = period.end.getTime() - period.start.getTime();
  if (totalMs <= 0 || remainingMs < MIN_UPGRADE_REMAINING_MS) return { kind: "refused", reason: "renewal-due" };

  const fromNet = from.recurringAmountCents - input.fromDiscountCents;
  const toNet = to.recurringAmountCents - input.toDiscountCents;
  if (fromNet <= 0 || toNet <= 0 || toNet <= fromNet) return { kind: "refused", reason: "not-an-upgrade" };

  // Whole days, so the amount and the words beside it ("20 of 30 days") are the same arithmetic, and a quote taken
  // twice on the same day is the same quote. A day that has begun counts as left: the customer is not charged for a
  // part of a day they cannot use, but they are not charged less for it either.
  const periodDays = Math.max(1, Math.round(totalMs / MS_PER_DAY));
  const daysLeft = Math.min(periodDays, Math.max(1, Math.ceil(remainingMs / MS_PER_DAY)));
  const netDifferenceCents = shareOf(toNet - fromNet, daysLeft, periodDays);
  const chargeCents = netDifferenceCents >= 1 ? chargedAmountCents(netDifferenceCents, 0, to.taxRateBasisPoints) : 0;
  const free = chargeCents < MIN_ONLINE_CHARGE_CENTS;
  return {
    kind: "quote",
    netDifferenceCents,
    chargeCents: free ? 0 : chargeCents,
    free,
    nextRenewalCents: chargedAmountCents(to.recurringAmountCents, input.toDiscountCents, to.taxRateBasisPoints),
    periodEnd: period.end,
    daysLeft,
    periodDays,
  };
}

/**
 * Whether a payment taken for an upgrade quoted earlier still buys it: the subscription must still be in the month the
 * quote was for. Once it has renewed, the quote undercharges (more of the month is left than it assumed), so the money
 * is kept on record and flagged for a refund instead.
 */
export function quoteStillStands(quotedPeriodEnd: Date, currentPaidThroughAt: Date | null): boolean {
  return currentPaidThroughAt !== null && currentPaidThroughAt.getTime() === quotedPeriodEnd.getTime();
}

/**
 * The upgrade charge's description on Billing and the receipt: "Upgrade to Premium", a middle dot, "31 days left". The
 * invoice prints the dot as a comma (normaliseInvoiceText), so the stored wording can stay as the app shows it.
 */
export function upgradeChargeDescription(daysLeft: number): string {
  return `Upgrade to Premium \u00B7 ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}
