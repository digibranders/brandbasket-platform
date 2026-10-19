import { chargedAmountCents, GST_BASIS_POINTS } from "@brandbasket/billing/tax";
import type { MoneyCurrency } from "../money";
import { lifetimeOfferCentsFor } from "./lifetime-offer";

/**
 * The services a business adds to Managed Website: Digital Growth and Local SEO + AEO (docs/plans/11-platform-plans.md in
 * the BrandBasket workspace), and what each costs in each currency a business is billed in. Rupee prices are net of GST,
 * in paise; dollar prices are in cents with no tax. They match the website's pricing page: change both together. A price
 * here only affects new purchases; what a business pays for an existing subscription is stored on it. Pure and
 * browser-safe.
 */

export const ADD_ONS_PATH = "/add-ons";

/** Days after Razorpay gives up on a renewal during which the customer can still Pay now. */
export const ADD_ON_GRACE_DAYS = 7;

const MINOR_UNITS_PER_MAJOR = 100;

export type AddOnId = "digital-growth" | "local-seo-aeo";
export type MonthlyAddOnId = AddOnId;

export interface AddOn {
  readonly id: AddOnId;
  readonly title: string;
  /** One line on what the service does for the business. */
  readonly line: string;
  readonly billing: "monthly" | "one-time";
  /** The list price before any discount, in minor units of each currency: net of GST in rupees, untaxed in dollars. */
  readonly prices: Readonly<Record<MoneyCurrency, number>>;
  /** What the price is for: "a month". */
  readonly unit: string;
  /** Costs paid to others on top, said in a few words; absent when there are none. */
  readonly extra?: string;
  readonly platforms?: readonly string[];
}

/** The services, in the order the website's pricing page lists them. */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: "digital-growth",
    title: "Digital Growth",
    line: "Your Google Business Profile kept active, with up to 8 posts a month and review replies, and your Facebook and Instagram ads run for you.",
    billing: "monthly",
    prices: { INR: 7_000 * MINOR_UNITS_PER_MAJOR, USD: 75 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
    extra: "+ your ad spend",
    platforms: ["Google Business Profile", "Facebook Ads", "Instagram Ads"],
  },
  {
    id: "local-seo-aeo",
    title: "Local SEO + AEO",
    line: "Local search and AI answer optimisation: keyword research, up to 5 pages optimised a month, schema, and ranking tracking.",
    billing: "monthly",
    prices: { INR: 25_000 * MINOR_UNITS_PER_MAJOR, USD: 350 * MINOR_UNITS_PER_MAJOR },
    unit: "a month",
  },
];

export const MONTHLY_ADD_ON_IDS: readonly MonthlyAddOnId[] = ["digital-growth", "local-seo-aeo"];

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

/** What one purchase costs, worked out once and stored on it. All amounts in minor units of the purchase's currency. */
export interface AddOnPrice {
  readonly currency: MoneyCurrency;
  readonly listCents: number;
  readonly discountCents: number;
  /** The part of `discountCents` that is the first-checkout lifetime offer (lifetime-offer.ts), or 0. */
  readonly offerCents: number;
  /** List less discount: the taxable value. */
  readonly netCents: number;
  readonly taxRateBasisPoints: number;
  /** What Razorpay takes: net plus any tax, from chargedAmountCents like every other price. */
  readonly chargedCents: number;
}

/** GST in India; nothing of ours on a dollar price, as on the dollar plan (plans.tax_rate_basis_points). */
export function addOnTaxRateBasisPoints(currency: MoneyCurrency): number {
  return currency === "INR" ? GST_BASIS_POINTS : 0;
}

/** What one purchase costs: the list price, less the 5% sign-up offer when the add-on is taken with the first checkout. */
export function addOnPrice(addOn: AddOn, currency: MoneyCurrency, lifetimeOffer = false): AddOnPrice {
  const listCents = addOn.prices[currency];
  const offerCents = lifetimeOffer ? lifetimeOfferCentsFor(listCents) : 0;
  const discountCents = offerCents;
  const taxRateBasisPoints = addOnTaxRateBasisPoints(currency);
  return {
    currency,
    listCents,
    discountCents,
    offerCents,
    netCents: listCents - discountCents,
    taxRateBasisPoints,
    chargedCents: chargedAmountCents(listCents, discountCents, taxRateBasisPoints),
  };
}
