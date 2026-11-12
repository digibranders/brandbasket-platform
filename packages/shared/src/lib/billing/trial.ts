import type { BillingInterval, BillingProviderName } from "@brandbasket/db";
// Subpaths, not the package index: this module reaches client components, and the index pulls in the database.
import { addMonthsUtc } from "@brandbasket/billing/term";
import type { MoneyCurrency } from "../money";
import type { AddOnId, PlanAddOnId } from "./add-ons";
import { shareOf } from "./add-on-proration";

/*
 * The first-month offer (owner, 2026-11-12; docs/plans/63-one-rupee-trial.md in the BrandBasket workspace): a business
 * that has never had Social Media Management, or never had Paid Ads Management, pays ₹1 or $1 for that plan's first
 * month, which runs one calendar month from that payment. After it the plan bills at its own price. Monthly billing
 * only. Pure and browser-safe, so the checkout, the server and the tests share one set of rules.
 */

/** The plans the offer covers. */
export const TRIAL_ADD_ON_IDS = ["social-media", "paid-ads"] as const satisfies readonly PlanAddOnId[];

export type TrialAddOnId = (typeof TRIAL_ADD_ON_IDS)[number];

/** What the trial month costs, in minor units, GST included in rupees: ₹1 or $1. */
const TRIAL_PRICES: Readonly<Record<MoneyCurrency, number>> = { INR: 100, USD: 100 };

/** How long the trial runs from its payment. */
export const TRIAL_MONTHS = 1;

const MS_PER_DAY = 86_400_000;

export function isTrialAddOnId(value: string): value is TrialAddOnId {
  return (TRIAL_ADD_ON_IDS as readonly string[]).includes(value);
}

export function trialPriceCents(currency: MoneyCurrency): number {
  return TRIAL_PRICES[currency];
}

export interface TrialEligibilityInput {
  readonly service: AddOnId;
  readonly interval: BillingInterval;
  readonly provider: BillingProviderName;
  /** The business has had this plan before, paid or on a trial, on any subscription. */
  readonly hadService: boolean;
}

/** Whether this purchase gets the first month for ₹1: a covered plan, never had before, billed monthly and not by bank transfer. */
export function trialEligible(input: TrialEligibilityInput): boolean {
  return isTrialAddOnId(input.service) && !input.hadService && input.interval === "month" && input.provider !== "manual";
}

/** When a trial paid at `paidAt` ends: one calendar month on, clamped to the end of a shorter month. */
export function trialEndsAt(paidAt: Date): Date {
  return addMonthsUtc(paidAt, TRIAL_MONTHS);
}

/**
 * What a line costs for one billing cycle when it may still be in its trial: its price for the whole days of the cycle
 * after the trial ends. A day the trial has begun counts as a trial day. Full price once the trial is over or with no
 * trial; nothing while it covers the whole cycle. Rounded half up, as the add-on quote is.
 */
export function billedAfterTrialCents(priceCents: number, trialEnd: Date | null, cycle: { readonly start: Date; readonly end: Date }): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new RangeError(`A price must be whole, non-negative minor units, received ${priceCents}`);
  const cycleMs = cycle.end.getTime() - cycle.start.getTime();
  if (!(cycleMs > 0)) throw new RangeError("A billing cycle must end after it starts");
  if (trialEnd === null || trialEnd.getTime() <= cycle.start.getTime()) return priceCents;
  if (trialEnd.getTime() >= cycle.end.getTime()) return 0;

  const cycleDays = Math.max(1, Math.round(cycleMs / MS_PER_DAY));
  const trialDays = Math.min(cycleDays, Math.ceil((trialEnd.getTime() - cycle.start.getTime()) / MS_PER_DAY));
  return shareOf(priceCents, cycleDays - trialDays, cycleDays);
}
