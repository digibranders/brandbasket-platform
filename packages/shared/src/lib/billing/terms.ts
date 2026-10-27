import type { Plan, ReferralDiscount } from "@brandbasket/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@brandbasket/billing/tax";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { describeDiscountMonths, describeReferralDiscount } from "./referral-value";

/**
 * What the first payment covers: "your first month" for a one-month start, "your first 3 months" otherwise. Staff
 * copy passes "their". The term always comes from the plan row, never from copy.
 */
export function initialTermPhrase(initialTermMonths: number, whose: "your" | "their" = "your"): string {
  return `${whose} ${firstTerm(initialTermMonths)}`;
}

/** "first month" or "first 3 months", for a plan's initial term. */
function firstTerm(initialTermMonths: number): string {
  if (!Number.isInteger(initialTermMonths) || initialTermMonths < 1) {
    throw new RangeError(`A plan's initial term must be a whole number of months, at least 1, received ${initialTermMonths}`);
  }
  return initialTermMonths === 1 ? "first month" : `first ${initialTermMonths} months`;
}

/** The first payment's term as a short label beside its price: "First month" or "First 3 months". */
export function initialTermLabel(initialTermMonths: number): string {
  const term = firstTerm(initialTermMonths);
  return `${term.charAt(0).toUpperCase()}${term.slice(1)}`;
}

type PricedPlan = Pick<Plan, "initialAmountCents" | "currency" | "taxRateBasisPoints">;
type TermedPlan = Pick<
  Plan,
  "initialAmountCents" | "initialTermMonths" | "recurringAmountCents" | "currency" | "taxRateBasisPoints"
>;

/**
 * What the first payment actually takes, formatted in the plan's currency: "$65", or "₹2,999" for the ₹2,999 plan. Every
 * price includes GST, so this is the figure a Pay button must show, because it is the figure the provider charges.
 * `bundledAddOnPriceCents` is the services billed as lines on top of the plan's own price (0 for the services plan).
 */
export function firstPaymentAmount(plan: PricedPlan, bundledAddOnPriceCents = 0): string {
  return formatMoney(chargedAmountCents(plan.initialAmountCents + bundledAddOnPriceCents, 0), plan.currency);
}

/**
 * What a month at the plan's price takes, with no discount, formatted: what a reactivation records
 * (docs/superpowers/specs/2026-10-09-reactivation-design.md). "₹9,999" for the ₹9,999 plan.
 */
export function monthlyPaymentAmount(
  plan: Pick<Plan, "recurringAmountCents" | "currency">,
  bundledAddOnPriceCents = 0,
): string {
  return formatMoney(chargedAmountCents(plan.recurringAmountCents + bundledAddOnPriceCents, 0), plan.currency);
}

/**
 * What each renewal actually takes, formatted: the basket's lines (and the plan's own price, 0 for the services plan)
 * less the discount frozen onto the subscription. A "next payment" figure must be this, not the bare price, or a customer
 * with a code is told the full price and charged less. Null when the discount would leave nothing to charge.
 */
export function renewalCharge(
  plan: Pick<Plan, "recurringAmountCents" | "currency">,
  discountAmountCents: number,
  bundledAddOnPriceCents = 0,
): string | null {
  const priceCents = plan.recurringAmountCents + bundledAddOnPriceCents;
  if (discountAmountCents >= priceCents) return null;
  return formatMoney(chargedAmountCents(priceCents, discountAmountCents), plan.currency);
}

/**
 * A monthly price in words: "$65 a month", or "₹2,999 a month, GST included". GST is named because it is the only tax any
 * plan carries and the price already holds it; a plan with none says nothing.
 */
function monthlyPriceWords(priceCents: number, plan: Pick<Plan, "currency" | "taxRateBasisPoints">): string {
  // chargedAmountCents refuses a price of nothing, so a plan with no services is never worded as free.
  const price = formatMoney(chargedAmountCents(priceCents, 0), plan.currency);
  return plan.taxRateBasisPoints === 0 ? `${price} a month` : `${price} a month, GST included`;
}

/**
 * The whole price in a sentence. A plan that starts at its monthly price reads "$65 a month. Your first payment
 * covers your first month, then it renews monthly."; a taxed one says the GST is included. Any other start
 * names both amounts: "$195 covers your first 3 months, then it's $65 a month." `bundledAddOnPriceCents` is the services
 * billed as lines on top of the plan's own price, which is the whole price on the services plan (it costs 0 itself).
 * `afterFirstTerm` is for a customer whose first term is over: the price, then "Renews monthly."
 */
export function describePlanTerms(plan: TermedPlan, bundledAddOnPriceCents = 0, options: { readonly afterFirstTerm?: boolean } = {}): string {
  const term = initialTermPhrase(plan.initialTermMonths);
  const recurringCents = plan.recurringAmountCents + bundledAddOnPriceCents;
  // The first payment is in the past, so the sentence about it would only confuse: say what happens now.
  if (options.afterFirstTerm === true) return `${monthlyPriceWords(recurringCents, plan)}. Renews monthly.`;
  if (plan.initialTermMonths === 1 && plan.initialAmountCents === plan.recurringAmountCents) {
    return `${monthlyPriceWords(recurringCents, plan)}. Your first payment covers ${term}, then it renews monthly.`;
  }
  return `${firstPaymentAmount(plan, bundledAddOnPriceCents)} covers ${term}, then it’s ${monthlyPriceWords(recurringCents, plan)}.`;
}

type ChangePricing = Pick<
  Plan,
  | "currency"
  | "includedChangeHours"
  | "extraHourAmountCents"
  | "includedBlogPosts"
  | "blogPostBlockSize"
  | "extraBlogPostsAmountCents"
>;

/** How changes and blog posts are charged, in the plan's currency. */
export function changesNote(plan: ChangePricing): string {
  const freeHours =
    plan.includedChangeHours === 1
      ? "Your first hour of changes is free"
      : `Your first ${plan.includedChangeHours} hours of changes are free`;
  const hourly = formatMoney(plan.extraHourAmountCents, plan.currency);
  const block = formatMoney(plan.extraBlogPostsAmountCents, plan.currency);
  return `${freeHours}, then it’s ${hourly} an hour. Up to ${plan.includedBlogPosts} blog posts are included, then ${block} for every ${plan.blogPostBlockSize} more.`;
}

/** A referral code in force: what it is called and what it takes off every month. */
export interface PlanDiscount {
  readonly code: string;
  /** What it takes off, in the plan's minor units. Frozen at checkout, never re-derived. */
  readonly amountCents: number;
  /** How many paid months it takes that off, or null for no limit. */
  readonly months: number | null;
  /**
   * The discount as the code states it, a flat amount or a percentage, purely for the words beside it. Every figure
   * of money comes from `amountCents`, which a percentage has already been resolved to against this plan. Null for
   * an affiliate code that gives no discount (`amountCents` is then 0).
   */
  readonly stated: ReferralDiscount | null;
}

/**
 * The first payment's amount with a referral discount taken off: "₹2,975". Passing null gives the plan's own
 * price, so callers need no branch of their own.
 */
export function discountedFirstPaymentAmount(
  plan: PricedPlan,
  discount: Pick<PlanDiscount, "amountCents"> | null,
  bundledAddOnPriceCents = 0,
): string {
  const charged = chargedAmountCents(plan.initialAmountCents + bundledAddOnPriceCents, discount?.amountCents ?? 0);
  return formatMoney(charged, plan.currency);
}

/**
 * The whole price with a referral discount applied, in a sentence. The monthly figure it quotes is the discounted one,
 * and the sentence says for how long: "for 3 months", or "for as long as your plan runs" when the code has no limit.
 * Saying otherwise would promise a price the customer is never charged.
 */
export function describeDiscountedPlanTerms(
  plan: TermedPlan,
  discount: Pick<PlanDiscount, "amountCents" | "months"> | null,
  bundledAddOnPriceCents = 0,
): string {
  if (discount === null || discount.amountCents === 0) return describePlanTerms(plan, bundledAddOnPriceCents);
  const recurringCents = plan.recurringAmountCents + bundledAddOnPriceCents;
  const was = formatMoney(recurringCents, plan.currency);
  const term = initialTermPhrase(plan.initialTermMonths);
  const discounted = monthlyPriceWords(recurringCents - discount.amountCents, plan);
  const howLong = discount.months === null ? "for as long as your plan runs" : `for ${describeDiscountMonths(discount.months)}`;
  return `${discounted}, instead of ${was}, ${howLong}. Your first payment covers ${term}, then it renews monthly.`;
}

/**
 * How a discount is described beside the code that earned it: "₹500 off, every month", or for a percentage code
 * "10% off (₹299.90), every month", naming the money it came to so the customer can check the price beside it. A code
 * with a length says so instead: "₹500 off a month for 3 months".
 * Null for an affiliate code that gives no discount: there is nothing to describe.
 */
export function describeDiscount(discount: PlanDiscount, currency: MoneyCurrency): string | null {
  if (discount.stated === null) return null;
  const off = describeReferralDiscount(discount.stated, currency);
  const stated = discount.stated.kind === "amount" ? off : `${off} (${formatMoney(discount.amountCents, currency)})`;
  return discount.months === null ? `${stated}, every month` : `${stated} a month for ${describeDiscountMonths(discount.months)}`;
}
