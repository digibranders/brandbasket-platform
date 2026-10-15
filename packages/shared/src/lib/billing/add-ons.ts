import { chargedAmountCents, GST_BASIS_POINTS } from "@fynix/billing/tax";
import { lifetimeOfferCentsFor } from "./lifetime-offer";

/**
 * The digital-marketing services a business buys from the Add-ons page (docs/superpowers/specs/2026-10-09-add-ons-
 * design.md), and what each costs. Prices are net of GST, in paise, and match the website's Digital marketing page
 * (fynix-website content/for-business.ts): change both together. A price here only affects new purchases; what a
 * business pays for an existing subscription is stored on it. Pure and browser-safe.
 */

export const ADD_ONS_PATH = "/add-ons";

/** What a Premium member takes off an add-on, as a whole percent, at the moment of purchase. */
export const PREMIUM_ADD_ON_DISCOUNT_PERCENT = 10;

/** Days after Razorpay gives up on a renewal during which the customer can still Pay now. */
export const ADD_ON_GRACE_DAYS = 7;

const PAISE_PER_RUPEE = 100;

export type AddOnId = "social-media" | "lead-generation" | "advertising";
export type MonthlyAddOnId = AddOnId;

export interface AddOn {
  readonly id: AddOnId;
  readonly title: string;
  /** One line on what the service does for the business. */
  readonly line: string;
  readonly billing: "monthly" | "one-time";
  /** The list price before any discount, net of GST, in paise. */
  readonly paise: number;
  /** What the price is for: "a month". */
  readonly unit: string;
  /** Costs the ad platforms charge on top, said in a few words; absent when there are none. */
  readonly extra?: string;
  readonly platforms?: readonly string[];
}

/** The services, in the order the Add-ons page lists them (the same as the website's table). */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: "social-media",
    title: "Social media",
    line: "Your Facebook and Instagram accounts managed for you.",
    billing: "monthly",
    paise: 1_999 * PAISE_PER_RUPEE,
    unit: "a month",
  },
  {
    id: "lead-generation",
    title: "Outreach and lead generation",
    line: "We reach out to the right people and bring you new leads.",
    billing: "monthly",
    paise: 3_999 * PAISE_PER_RUPEE,
    unit: "a month",
  },
  {
    id: "advertising",
    title: "Paid advertising",
    line: "Google Ads and Meta Ads managed to bring in leads and enquiries.",
    billing: "monthly",
    paise: 5_999 * PAISE_PER_RUPEE,
    unit: "a month",
    extra: "+ platform fees",
    platforms: ["Google Ads", "Facebook Ads", "Instagram Ads"],
  },
];

export const MONTHLY_ADD_ON_IDS: readonly MonthlyAddOnId[] = ["social-media", "lead-generation", "advertising"];

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

/** What one purchase costs, worked out once and stored on it. All amounts in paise. */
export interface AddOnPrice {
  readonly listCents: number;
  readonly discountCents: number;
  /** The part of `discountCents` that is the first-checkout lifetime offer (lifetime-offer.ts), or 0. */
  readonly offerCents: number;
  /** List less discount: the taxable value. */
  readonly netCents: number;
  readonly taxRateBasisPoints: number;
  /** What Razorpay takes: net plus GST, from chargedAmountCents like every other price. */
  readonly chargedCents: number;
}

export function addOnPrice(addOn: AddOn, premium: boolean, lifetimeOffer = false): AddOnPrice {
  const premiumCents = premium ? Math.round((addOn.paise * PREMIUM_ADD_ON_DISCOUNT_PERCENT) / 100) : 0;
  const offerCents = lifetimeOffer ? lifetimeOfferCentsFor(addOn.paise) : 0;
  const discountCents = premiumCents + offerCents;
  return {
    listCents: addOn.paise,
    discountCents,
    offerCents,
    netCents: addOn.paise - discountCents,
    taxRateBasisPoints: GST_BASIS_POINTS,
    chargedCents: chargedAmountCents(addOn.paise, discountCents, GST_BASIS_POINTS),
  };
}
