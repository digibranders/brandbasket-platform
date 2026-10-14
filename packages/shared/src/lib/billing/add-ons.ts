import { chargedAmountCents, GST_BASIS_POINTS } from "@fynix/billing/tax";

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

export type AddOnId = "local-seo" | "performance-marketing" | "press-release";
export type MonthlyAddOnId = Extract<AddOnId, "local-seo" | "performance-marketing">;

export interface AddOn {
  readonly id: AddOnId;
  readonly title: string;
  /** One line on what the service does for the business. */
  readonly line: string;
  readonly billing: "monthly" | "one-time";
  /** The list price before any discount, net of GST, in paise. */
  readonly paise: number;
  /** What the price is for: "a month" or "a release". */
  readonly unit: string;
  /** Costs the ad platforms charge on top, said in a few words; absent when there are none. */
  readonly extra?: string;
  readonly platforms?: readonly string[];
}

/** The services, dearest first. */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: "local-seo",
    title: "Local SEO",
    line: "Be found when people nearby search.",
    billing: "monthly",
    paise: 10_000 * PAISE_PER_RUPEE,
    unit: "a month",
  },
  {
    id: "performance-marketing",
    title: "Performance marketing",
    line: "Campaigns built to drive leads, enquiries, bookings, and sales.",
    billing: "monthly",
    paise: 8_000 * PAISE_PER_RUPEE,
    unit: "a month",
    extra: "+ platform fees",
    platforms: ["Facebook Ads", "Instagram Ads", "YouTube Ads", "Google Ads", "Google Business Profile"],
  },
  {
    id: "press-release",
    title: "Press release",
    line: "Your launch, offer or news, sent out.",
    billing: "one-time",
    paise: 7_000 * PAISE_PER_RUPEE,
    unit: "a release",
  },
];

export const MONTHLY_ADD_ON_IDS: readonly MonthlyAddOnId[] = ["local-seo", "performance-marketing"];

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
  /** List less discount: the taxable value. */
  readonly netCents: number;
  readonly taxRateBasisPoints: number;
  /** What Razorpay takes: net plus GST, from chargedAmountCents like every other price. */
  readonly chargedCents: number;
}

export function addOnPrice(addOn: AddOn, premium: boolean): AddOnPrice {
  const discountCents = premium ? Math.round((addOn.paise * PREMIUM_ADD_ON_DISCOUNT_PERCENT) / 100) : 0;
  return {
    listCents: addOn.paise,
    discountCents,
    netCents: addOn.paise - discountCents,
    taxRateBasisPoints: GST_BASIS_POINTS,
    chargedCents: chargedAmountCents(addOn.paise, discountCents, GST_BASIS_POINTS),
  };
}

/**
 * The line a press release's invoice prints. It says when the Premium member price was taken, so the amount on the
 * invoice is explained by the invoice itself. Plain characters only, so the invoice can always draw it.
 */
export function pressReleaseChargeDescription(premium: boolean): string {
  return premium ? "Press release, Premium member price" : "Press release";
}
