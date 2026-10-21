import type { Plan, ReferralDiscount } from "@brandbasket/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@brandbasket/billing/tax";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { describeReferralDiscount } from "./referral-value";

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

/** A tax rate as people read it: 1800 basis points is "18%". */
function taxRateLabel(taxRateBasisPoints: number): string {
  return `${taxRateBasisPoints / 100}%`;
}

/**
 * What the first payment actually takes, tax included, formatted in the plan's currency: "$69", or "₹3,538.82"
 * for ₹2,999 plus GST. This is the figure a Pay button must show, because it is the figure the provider charges.
 * `bundledAddOnNetCents` is the services billed as lines on top of the plan's own price (0 for the services plan).
 */
export function firstPaymentAmount(plan: PricedPlan, bundledAddOnNetCents = 0): string {
  return formatMoney(chargedAmountCents(plan.initialAmountCents + bundledAddOnNetCents, 0, plan.taxRateBasisPoints), plan.currency);
}

/**
 * What a month at the plan's price takes, tax included and with no discount, formatted: what a reactivation records
 * (docs/superpowers/specs/2026-10-09-reactivation-design.md). "₹11,798.82" for ₹9,999 plus GST.
 */
export function monthlyPaymentAmount(
  plan: Pick<Plan, "recurringAmountCents" | "currency" | "taxRateBasisPoints">,
  bundledAddOnNetCents = 0,
): string {
  return formatMoney(chargedAmountCents(plan.recurringAmountCents + bundledAddOnNetCents, 0, plan.taxRateBasisPoints), plan.currency);
}

/**
 * What each renewal actually takes, formatted: the basket's lines (and the plan's own price, 0 for the services plan)
 * less the discount frozen onto the subscription, with the plan's tax on top ("₹31,388" for all three services at
 * ₹26,600 plus GST). A "next payment" figure must be this, not the bare net, or an Indian customer is told ₹26,600 and
 * charged ₹31,388. Null when the discount would leave nothing to charge.
 */
export function renewalCharge(
  plan: Pick<Plan, "recurringAmountCents" | "currency" | "taxRateBasisPoints">,
  discountAmountCents: number,
  bundledAddOnNetCents = 0,
): string | null {
  const netCents = plan.recurringAmountCents + bundledAddOnNetCents;
  if (discountAmountCents >= netCents) return null;
  return formatMoney(chargedAmountCents(netCents, discountAmountCents, plan.taxRateBasisPoints), plan.currency);
}

/**
 * A monthly price in words, with any tax spelled out: "$69 a month", or "₹2,999 a month plus 18% GST, so
 * ₹3,538.82 in all". GST is named because it is the only tax any plan carries; a plan with none says nothing.
 */
function monthlyPriceWords(netCents: number, plan: Pick<Plan, "currency" | "taxRateBasisPoints">): string {
  const net = formatMoney(netCents, plan.currency);
  if (plan.taxRateBasisPoints === 0) return `${net} a month`;
  const total = formatMoney(chargedAmountCents(netCents, 0, plan.taxRateBasisPoints), plan.currency);
  return `${net} a month plus ${taxRateLabel(plan.taxRateBasisPoints)} GST, so ${total} in all`;
}

/**
 * The whole price in a sentence. A plan that starts at its monthly price reads "$69 a month. Your first payment
 * covers your first month, then it renews monthly."; a taxed one names the tax and the total. Any other start
 * names both amounts: "$225 covers your first 3 months, then it's $75 a month."
 */
export function describePlanTerms(plan: TermedPlan): string {
  const term = initialTermPhrase(plan.initialTermMonths);
  if (plan.initialTermMonths === 1 && plan.initialAmountCents === plan.recurringAmountCents) {
    return `${monthlyPriceWords(plan.recurringAmountCents, plan)}. Your first payment covers ${term}, then it renews monthly.`;
  }
  return `${firstPaymentAmount(plan)} covers ${term}, then it’s ${monthlyPriceWords(plan.recurringAmountCents, plan)}.`;
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
export function discountedFirstPaymentAmount(plan: PricedPlan, discount: Pick<PlanDiscount, "amountCents"> | null): string {
  const charged = chargedAmountCents(plan.initialAmountCents, discount?.amountCents ?? 0, plan.taxRateBasisPoints);
  return formatMoney(charged, plan.currency);
}

/**
 * The whole price with a referral discount applied, in a sentence. The discount runs for as long as the
 * subscription does, so the monthly figure it quotes is the discounted one. Saying otherwise would promise a
 * price the customer is never charged.
 */
export function describeDiscountedPlanTerms(plan: TermedPlan, discount: Pick<PlanDiscount, "amountCents"> | null): string {
  if (discount === null || discount.amountCents === 0) return describePlanTerms(plan);
  const full = formatMoney(plan.recurringAmountCents, plan.currency);
  const term = initialTermPhrase(plan.initialTermMonths);
  const discounted = monthlyPriceWords(plan.recurringAmountCents - discount.amountCents, plan);
  // The list price is quoted net, like the discounted one, so a taxed plan says so rather than implying the totals.
  const was = plan.taxRateBasisPoints === 0 ? full : `${full} before GST`;
  return `${discounted}, instead of ${was}, for as long as your plan runs. Your first payment covers ${term}, then it renews monthly.`;
}

/**
 * How a discount is described beside the code that earned it: "₹500 off, every month", or for a percentage code
 * "10% off (₹299.90), every month", naming the money it came to so the customer can check the price beside it.
 * Null for an affiliate code that gives no discount: there is nothing to describe.
 */
export function describeDiscount(discount: PlanDiscount, currency: MoneyCurrency): string | null {
  if (discount.stated === null) return null;
  const stated = describeReferralDiscount(discount.stated, currency);
  if (discount.stated.kind === "amount") return `${stated}, every month`;
  return `${stated} (${formatMoney(discount.amountCents, currency)}), every month`;
}
