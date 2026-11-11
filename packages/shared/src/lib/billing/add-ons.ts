import { chargedAmountCents, GST_BASIS_POINTS } from "@brandbasket/billing/tax";
import type { MoneyCurrency } from "../money";

/**
 * The services Brandbasket bills, and what each lists at in each currency a business is billed in. The plans on sale are
 * Website Management, Social Media Management and Paid Ads Management (owner, 2026-11-06), each on its own or two or more
 * together as a package priced in packages.ts, plus Dedicated Expert Monitoring, a monthly add-on that comes at no cost with
 * all three plans. Social Media and Ads (digital-growth) and Local SEO + AEO (local-seo-aeo) are no longer sold: they stay
 * here, unsold, because subscriptions bought before 2026-11-06 still bill them at the price stored on them. Every price
 * includes GST (owner, 2026-10-26; docs/plans/25-money-gst-and-offers.md): rupee prices are in paise with 18% GST inside
 * them, dollar prices are in cents with no tax of ours. They match the website's lib/pricing.ts: change both together. A
 * price here only affects new purchases; what a business pays for an existing subscription is stored on it. Pure and
 * browser-safe.
 */

export const ADD_ONS_PATH = "/services";

/** Days after Razorpay gives up on a renewal during which the customer can still Pay now. */
export const ADD_ON_GRACE_DAYS = 7;

const MINOR_UNITS_PER_MAJOR = 100;

export type AddOnId = "managed-website" | "social-media" | "paid-ads" | "expert-monitoring" | "digital-growth" | "local-seo-aeo";
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
  /** Whether it can be bought now. An unsold service is only ever a line a business already has. */
  readonly sold: boolean;
  /**
   * The plan a service counts as in a package (packages.ts): a plan is its own; an unsold plan counts as the one that took
   * its place, slot for slot (owner, 2026-11-06), so a basket bought before keeps its offer. Null for monitoring, which is
   * never part of a package.
   */
  readonly packageSlot: PlanAddOnId | null;
}

/** Dedicated Expert Monitoring: included with all three plans, otherwise billed monthly (monitoringIncludedWith). */
export const MONITORING_ID = "expert-monitoring" satisfies AddOnId;

/** The services, plans first in the order the website's pricing page lists them, then monitoring, then the unsold ones. */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: "managed-website",
    title: "Website Management",
    line: "A professionally designed website of up to 10 pages, mobile-friendly, with enquiry forms, click-to-call, a local SEO foundation and the OyeChats professional chatbot.",
    billing: "monthly",
    prices: { INR: 2_999 * MINOR_UNITS_PER_MAJOR, USD: 65 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    sold: true,
    packageSlot: "managed-website",
  },
  {
    id: "social-media",
    title: "Social Media Management",
    line: "AI posts, captions and scheduling on up to 4 platforms, with a monthly performance report.",
    billing: "monthly",
    prices: { INR: 9_999 * MINOR_UNITS_PER_MAJOR, USD: 150 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    platforms: ["Instagram", "Facebook", "Google Business Profile"],
    sold: true,
    packageSlot: "social-media",
  },
  {
    id: "paid-ads",
    title: "Paid Ads Management",
    line: "Meta ads with AI creatives, set up and optimised, for up to ₹10,000 a month of your budget.",
    billing: "monthly",
    prices: { INR: 24_999 * MINOR_UNITS_PER_MAJOR, USD: 350 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    extra: "+ your ad spend",
    platforms: ["Facebook Ads", "Instagram Ads"],
    sold: true,
    packageSlot: "paid-ads",
  },
  {
    id: MONITORING_ID,
    title: "Dedicated Expert Monitoring",
    line: "Our experts watch your website, social media and ads, fix what slips and help you grow. Free with all three plans.",
    billing: "monthly",
    prices: { INR: 6_000 * MINOR_UNITS_PER_MAJOR, USD: 75 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    sold: true,
    packageSlot: null,
  },
  {
    // Not sold since 2026-11-06. The id predates the name: database checks, existing rows and links use it.
    id: "digital-growth",
    title: "Social Media and Ads",
    line: "Instagram, Facebook and Google profile posts planned with you each month, review replies, and Meta ads managed for up to ₹10,000 a month of your budget.",
    billing: "monthly",
    prices: { INR: 9_999 * MINOR_UNITS_PER_MAJOR, USD: 150 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    extra: "+ your ad spend",
    platforms: ["Google Business Profile", "Facebook Ads", "Instagram Ads"],
    sold: false,
    packageSlot: "social-media",
  },
  {
    // Not sold since 2026-11-06.
    id: "local-seo-aeo",
    title: "Local SEO + AEO",
    line: "Local search and AI answer optimisation: keyword research, up to 5 pages optimised a month, schema, and ranking tracking.",
    billing: "monthly",
    prices: { INR: 24_999 * MINOR_UNITS_PER_MAJOR, USD: 350 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    sold: false,
    packageSlot: "paid-ads",
  },
];

/** Every service a line can be, in the catalogue's order. */
export const MONTHLY_ADD_ON_IDS: readonly MonthlyAddOnId[] = ADD_ONS.map((addOn) => addOn.id);

/** What can be bought now, in the catalogue's order: the three plans and monitoring. */
export const SOLD_ADD_ON_IDS: readonly MonthlyAddOnId[] = ADD_ONS.filter((addOn) => addOn.sold).map((addOn) => addOn.id);

/** The three plans on sale. */
export const PLAN_ADD_ON_IDS: readonly PlanAddOnId[] = ["managed-website", "social-media", "paid-ads"];

const BY_ID: ReadonlyMap<string, AddOn> = new Map(ADD_ONS.map((addOn) => [addOn.id, addOn]));

export function isAddOnId(value: string): value is AddOnId {
  return BY_ID.has(value);
}

export function isMonthlyAddOnId(value: string): value is MonthlyAddOnId {
  return (MONTHLY_ADD_ON_IDS as readonly string[]).includes(value);
}

export function isSoldAddOnId(value: string): value is MonthlyAddOnId {
  return BY_ID.get(value)?.sold === true;
}

export function addOnById(id: AddOnId): AddOn {
  const addOn = BY_ID.get(id);
  if (addOn === undefined) throw new Error(`Unknown add-on ${id}`);
  return addOn;
}

/**
 * Whether monitoring comes at no cost with these services: all three plans are among them, an unsold plan counting as the
 * one in its slot. Such a basket is never billed for monitoring.
 */
export function monitoringIncludedWith(services: readonly MonthlyAddOnId[]): boolean {
  const slots = new Set(services.map((id) => BY_ID.get(id)?.packageSlot ?? null));
  return PLAN_ADD_ON_IDS.every((id) => slots.has(id));
}

/**
 * The services a services page lists, in the catalogue's order: what is on sale, and an unsold one only while the business
 * has it. Monitoring is left out beside all three plans, which include it. `active` is every service with an active line
 * (one that is ending included); `staying` the ones not asked to end.
 */
export function servicesToList(active: readonly string[], staying: readonly MonthlyAddOnId[]): MonthlyAddOnId[] {
  return MONTHLY_ADD_ON_IDS.filter((id) => {
    if (active.includes(id)) return true;
    if (id === MONITORING_ID) return !monitoringIncludedWith(staying);
    return isSoldAddOnId(id);
  });
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

/** What one purchase costs: the list price, less the package discount worked out for it (packageDiscountsFor), if any. */
export function addOnPrice(addOn: AddOn, currency: MoneyCurrency, discountCents = 0): AddOnPrice {
  const listCents = addOn.prices[currency];
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
