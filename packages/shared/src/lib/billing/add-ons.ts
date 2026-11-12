import { chargedAmountCents, GST_BASIS_POINTS } from "@brandbasket/billing/tax";
import type { BillingInterval } from "@brandbasket/db";
import type { MoneyCurrency } from "../money";

/**
 * The services Brandbasket sells, and what each lists at in each currency a business is billed in: Website Management,
 * Social Media Management and Paid Ads Management (owner, 2026-11-06), all three at one price (owner, 2026-11-11), each on its own or two or more together as a package
 * priced in packages.ts, plus Dedicated Expert Monitoring, a monthly add-on that comes at no cost with all three plans.
 * Social Media and Ads and Local SEO + AEO were retired with no customers on them (migration 0222). Every price
 * includes GST (owner, 2026-10-26; docs/plans/25-money-gst-and-offers.md): rupee prices are in paise with 18% GST inside
 * them, dollar prices are in cents with no tax of ours. They match the website's lib/pricing.ts: change both together. A
 * price here only affects new purchases; what a business pays for an existing subscription is stored on it. Pure and
 * browser-safe.
 */

export const ADD_ONS_PATH = "/services";

/** Days after Razorpay gives up on a renewal during which the customer can still Pay now. */
export const ADD_ON_GRACE_DAYS = 7;

const MINOR_UNITS_PER_MAJOR = 100;

export type AddOnId = "managed-website" | "social-media" | "paid-ads" | "expert-monitoring";
export type MonthlyAddOnId = AddOnId;

/** The three plans on sale, which make up the packages, in the order the website lists them. */
export type PlanAddOnId = "managed-website" | "social-media" | "paid-ads";

export interface AddOn {
  readonly id: AddOnId;
  readonly title: string;
  /** One line on what the service does for the business. */
  readonly line: string;
  readonly billing: "monthly" | "one-time";
  /** The list price before any discount, in minor units of each currency, GST included in rupees (none of ours on dollars). */
  readonly prices: Readonly<Record<MoneyCurrency, number>>;
  /** What the price is for: "a month". */
  readonly unit: string;
  /** Costs paid to others on top, said in a few words; absent when there are none. */
  readonly extra?: string;
  readonly platforms?: readonly string[];
}

/** Dedicated Expert Monitoring: included with all three plans, otherwise billed monthly (monitoringIncludedWith). */
export const MONITORING_ID = "expert-monitoring" satisfies AddOnId;

/** The services: the plans in the order the website's pricing page lists them, then monitoring. */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: "managed-website",
    title: "Website Management",
    line: "A professionally designed website of up to 10 pages, mobile-friendly, with enquiry forms, click-to-call, a local SEO foundation and the OyeChats professional chatbot.",
    billing: "monthly",
    prices: { INR: 2_999 * MINOR_UNITS_PER_MAJOR, USD: 59 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
  },
  {
    id: "social-media",
    title: "Social Media Management",
    line: "AI posts, captions and scheduling on up to 4 platforms, with a monthly performance report.",
    billing: "monthly",
    prices: { INR: 2_999 * MINOR_UNITS_PER_MAJOR, USD: 59 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    platforms: ["Instagram", "Facebook", "Google Business Profile"],
  },
  {
    id: "paid-ads",
    title: "Paid Ads Management",
    line: "Meta ads with AI creatives, set up and optimised, for up to ₹10,000 a month of your budget.",
    billing: "monthly",
    prices: { INR: 2_999 * MINOR_UNITS_PER_MAJOR, USD: 59 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    extra: "+ your ad spend",
    platforms: ["Facebook Ads", "Instagram Ads"],
  },
  {
    id: MONITORING_ID,
    title: "Dedicated Expert Monitoring",
    line: "Our experts watch your website, social media and ads, fix what slips and help you grow. Free with all three plans.",
    billing: "monthly",
    prices: { INR: 6_000 * MINOR_UNITS_PER_MAJOR, USD: 99 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
  },
];

/** Every service, in the catalogue's order. */
export const MONTHLY_ADD_ON_IDS: readonly MonthlyAddOnId[] = ADD_ONS.map((addOn) => addOn.id);

/** The three plans on sale. */
export const PLAN_ADD_ON_IDS: readonly PlanAddOnId[] = ["managed-website", "social-media", "paid-ads"];

const BY_ID: ReadonlyMap<string, AddOn> = new Map(ADD_ONS.map((addOn) => [addOn.id, addOn]));

export function isAddOnId(value: string): value is AddOnId {
  return BY_ID.has(value);
}

export function isMonthlyAddOnId(value: string): value is MonthlyAddOnId {
  return (MONTHLY_ADD_ON_IDS as readonly string[]).includes(value);
}

export function addOnById(id: AddOnId): AddOn {
  const addOn = BY_ID.get(id);
  if (addOn === undefined) throw new Error(`Unknown add-on ${id}`);
  return addOn;
}

/** Whether these services include all three plans, which bring monitoring at no cost: such a basket is never billed for it. */
export function monitoringIncludedWith(services: readonly MonthlyAddOnId[]): boolean {
  return PLAN_ADD_ON_IDS.every((id) => services.includes(id));
}

/**
 * The services a services page lists, in the catalogue's order: every one, except monitoring beside all three plans, which
 * include it. `active` is every service with an active line (one that is ending included); `staying` the ones not asked to end.
 */
export function servicesToList(active: readonly string[], staying: readonly MonthlyAddOnId[]): MonthlyAddOnId[] {
  return MONTHLY_ADD_ON_IDS.filter((id) => id !== MONITORING_ID || active.includes(id) || !monitoringIncludedWith(staying));
}

/** Paying for a year takes this much off twelve months of the monthly price (owner, 2026-11-11). */
export const ANNUAL_DISCOUNT_BASIS_POINTS = 1_000;

const MONTHS_A_YEAR = 12;
const BASIS_POINTS_WHOLE = 10_000;

/**
 * A year of a monthly price, less ANNUAL_DISCOUNT_BASIS_POINTS, rounded down to a whole rupee or dollar: ₹2,999 a month is
 * ₹32,389 a year (₹35,988 less ₹3,599), $59 is $637. In minor units, GST inside a rupee price as in the monthly one.
 */
export function annualPriceCents(monthlyCents: number): number {
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents < 0) throw new RangeError(`A monthly price must be whole, non-negative minor units, received ${monthlyCents}`);
  const discounted = (monthlyCents * MONTHS_A_YEAR * (BASIS_POINTS_WHOLE - ANNUAL_DISCOUNT_BASIS_POINTS)) / BASIS_POINTS_WHOLE;
  return Math.floor(discounted / MINOR_UNITS_PER_MAJOR) * MINOR_UNITS_PER_MAJOR;
}

/** Twelve months at the monthly price: what a year would cost with no annual discount, the "usually" beside a yearly price. */
export function annualListCents(monthlyCents: number): number {
  return monthlyCents * MONTHS_A_YEAR;
}

/** What a service costs each cycle in a currency: its monthly price, or its yearly price on a yearly subscription. */
export function cyclePriceCents(addOn: AddOn, currency: MoneyCurrency, interval: BillingInterval): number {
  const monthly = addOn.prices[currency];
  return interval === "year" ? annualPriceCents(monthly) : monthly;
}

/** How a price on this interval is said: "a month" or "a year". */
export function perCycle(interval: BillingInterval): string {
  return interval === "year" ? "a year" : "a month";
}

/** What one purchase costs, worked out once and stored on it. All amounts in minor units of the purchase's currency. */
export interface AddOnPrice {
  readonly currency: MoneyCurrency;
  readonly listCents: number;
  readonly discountCents: number;
  /** The part of `discountCents` that is the package offer (packages.ts), or 0. */
  readonly offerCents: number;
  /** List less discount: what the customer pays for it, GST included. (The name is older than GST-inclusive prices; the taxable value is worked out from it on the invoice.) */
  readonly netCents: number;
  /** The rate of the GST inside the price: 1800 in rupees, 0 in dollars. */
  readonly taxRateBasisPoints: number;
  /** What Razorpay takes: the same as `netCents`, from chargedAmountCents like every other price. */
  readonly chargedCents: number;
}

/** GST in India; nothing of ours on a dollar price, as on the dollar plan (plans.tax_rate_basis_points). */
export function addOnTaxRateBasisPoints(currency: MoneyCurrency): number {
  return currency === "INR" ? GST_BASIS_POINTS : 0;
}

/**
 * What one purchase costs each cycle: the list price, less the package discount worked out for it (packageDiscountsFor), if
 * any. On a yearly subscription the list price is the yearly one (cyclePriceCents), the annual discount already inside it.
 */
export function addOnPrice(addOn: AddOn, currency: MoneyCurrency, discountCents = 0, interval: BillingInterval = "month"): AddOnPrice {
  const listCents = cyclePriceCents(addOn, currency, interval);
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > listCents) {
    throw new RangeError(`A discount on ${addOn.title} must be whole minor units from 0 to ${listCents}, received ${discountCents}`);
  }
  const offerCents = discountCents;
  const taxRateBasisPoints = addOnTaxRateBasisPoints(currency);
  return {
    currency,
    listCents,
    discountCents,
    offerCents,
    netCents: listCents - discountCents,
    taxRateBasisPoints,
    chargedCents: chargedAmountCents(listCents, discountCents),
  };
}
