import type { BillingProviderName, SubscriptionStatus } from "@brandbasket/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { PeriodProgress } from "./period";

/*
 * Adding an add-on to a running Managed Website plan (docs/plans/13-platform-add-ons-after-signup.md in the BrandBasket
 * workspace): a charge now for the rest of the month already paid for, then the add-on joins the plan's monthly payment
 * from the next renewal. Pure, so the page, the server and the tests share one set of rules.
 */

/** Less than this is left of the paid month: the renewal is about to be taken, so the add-on waits for it. */
export const MIN_ADD_REMAINING_MS = 60 * 60 * 1000;

/** The smallest amount Razorpay will take as an order: ₹1, in paise. Anything under it is applied with no payment. */
export const MIN_ONLINE_CHARGE_CENTS = 100;

/** Why a business cannot add an add-on on its own, in words the page can look up. Null means it can. */
export type AddOnBlock =
  /** It is in the plan's payment already, and not on its way out. */
  | "already-added"
  /** Paid by bank transfer: there is no recurring billing to change, so staff add it. */
  | "manual-billing"
  /** It has asked to leave, or its account is closing. */
  | "ending"
  /** The provider could not take its last renewal. */
  | "payment-failing"
  /** It paid once and has lapsed. */
  | "lapsed"
  /** It has not paid for anything yet. */
  | "unpaid"
  /** Money arrived that bought nothing and staff have not dealt with it. */
  | "under-review";

export interface AddOnStanding {
  readonly hasSubscription: boolean;
  readonly provider: BillingProviderName | null;
  readonly status: SubscriptionStatus | null;
  readonly hasAccess: boolean;
  readonly hasEverPaid: boolean;
  readonly cancelRequested: boolean;
  readonly paymentUnderReview: boolean;
  /** The add-on is active in the plan's payment and has not been asked to stop. */
  readonly addOnActive: boolean;
}

/** Whether a business may add this add-on now, and if not, the first reason why. */
export function addOnBlock(standing: AddOnStanding): AddOnBlock | null {
  if (!standing.hasSubscription || standing.status === null || standing.provider === null) return "unpaid";
  if (standing.paymentUnderReview) return "under-review";
  if (!standing.hasAccess) return standing.hasEverPaid ? "lapsed" : "unpaid";
  if (standing.cancelRequested || standing.status === "cancelled") return "ending";
  if (standing.status !== "active") return "payment-failing";
  if (standing.provider === "manual") return "manual-billing";
  if (standing.addOnActive) return "already-added";
  return null;
}

export interface AddOnQuoteInput {
  /** The add-on's monthly net price, at list (an add-on added after the first payment has no offer). */
  readonly netCents: number;
  /** The plan's tax rate, which the add-on is charged at too. */
  readonly taxRateBasisPoints: number;
  /** The plan's net monthly price plus every add-on billed from the renewal, this one included. */
  readonly renewalNetCents: number;
  /** The discount frozen onto the subscription, taken off the plan's price at each renewal. */
  readonly renewalDiscountCents: number;
  /** The month the customer has paid for. */
  readonly period: Pick<PeriodProgress, "start" | "end">;
  readonly now: Date;
}

export interface AddOnQuote {
  readonly kind: "quote";
  /** What is worked out for the days left, before tax. */
  readonly netCents: number;
  /** What is taken now, tax included. Zero when there is nothing to take. */
  readonly chargeCents: number;
  /** True when the charge is too small for the provider to take: the add-on is applied with no payment. */
  readonly free: boolean;
  /** What each renewal takes from then on, tax included. */
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
  if (!Number.isSafeInteger(product * 2 + divisor)) throw new RangeError("An add-on's share is too large to work out exactly");
  return Math.floor((product * 2 + divisor) / (divisor * 2));
}

/**
 * What a client pays today to have an add-on for the rest of the month they have paid for: its monthly net price for the
 * share of the month that is left, with the plan's tax on top. The add-on's full price joins the next renewal.
 */
export function quoteAddOn(input: AddOnQuoteInput): AddOnQuote | { readonly kind: "refused"; readonly reason: "renewal-due" } {
  const { period, now } = input;
  const remainingMs = period.end.getTime() - now.getTime();
  const totalMs = period.end.getTime() - period.start.getTime();
  if (totalMs <= 0 || remainingMs < MIN_ADD_REMAINING_MS) return { kind: "refused", reason: "renewal-due" };

  // Whole days, so the amount and the words beside it ("14 days left") are the same arithmetic, and a quote taken twice
  // on the same day is the same quote. A day that has begun counts as left.
  const periodDays = Math.max(1, Math.round(totalMs / MS_PER_DAY));
  const daysLeft = Math.min(periodDays, Math.max(1, Math.ceil(remainingMs / MS_PER_DAY)));
  const netCents = shareOf(input.netCents, daysLeft, periodDays);
  const chargeCents = netCents >= 1 ? chargedAmountCents(netCents, 0, input.taxRateBasisPoints) : 0;
  const free = chargeCents < MIN_ONLINE_CHARGE_CENTS;
  return {
    kind: "quote",
    netCents,
    chargeCents: free ? 0 : chargeCents,
    free,
    nextRenewalCents: chargedAmountCents(input.renewalNetCents, input.renewalDiscountCents, input.taxRateBasisPoints),
    periodEnd: period.end,
    daysLeft,
    periodDays,
  };
}
