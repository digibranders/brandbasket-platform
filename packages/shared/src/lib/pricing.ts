import { formatMoney, type MoneyCurrency } from "./money";

/**
 * All money values are integers in minor units (US cents, or paise for INR) to avoid floating-point rounding.
 * Prices here are the single source of truth for every marketing page. What a customer is actually charged comes
 * from the plans table, whose active dollar Care plan migration 0174 sets to these same amounts.
 */

export const PRICE_CURRENCY = "USD";

function assertCents(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new RangeError(`Amount must be a non-negative whole number of cents, received ${amountCents}`);
  }
}

const wholeAmountFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: PRICE_CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const exactAmountFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: PRICE_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats cents as dollars, showing cents only when the amount has them. */
export function formatPrice(amountCents: number): string {
  assertCents(amountCents);
  const dollars = amountCents / 100;
  return amountCents % 100 === 0 ? wholeAmountFormat.format(dollars) : exactAmountFormat.format(dollars);
}

export const carePlan = {
  name: "Care",
  /** Pages in the standard website (the spec's plan.page_limit, not yet a database column). */
  pageLimit: 6,
  /** Charged from the first payment, which covers the first month, and every month after. */
  monthlyCents: 7_500,
  includes: [
    "Up to 5 pages, designed for your business",
    "Hosting and SSL certificate",
    "Security and software updates",
    "Google Business Profile setup",
    "Basic local SEO",
    "Contact form and click-to-call",
    "Google Map and directions",
    "Connected to your own domain",
  ],
} as const;

/**
 * Changes and blog posts (2026-09-17). The first hours of changes are free once per customer, then charged by the
 * hour; blog posts after the included ones are sold in blocks. The plans table holds the same amounts (migrations
 * 0026 and 0174); the website repository has its own copy of these prices.
 */
export const changePricing = {
  includedHours: 1,
  extraHourCents: 1_000,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsCents: 500,
} as const;

export type PlanPriceKey = "monthly" | "extraHour" | "extraBlogPosts";

/** The plan's prices in each currency Brandbasket sells in: dollars everywhere, rupees in India. */
export const planPrices: Readonly<Record<MoneyCurrency, Readonly<Record<PlanPriceKey, number>>>> = {
  USD: {
    monthly: carePlan.monthlyCents,
    extraHour: changePricing.extraHourCents,
    extraBlogPosts: changePricing.extraBlogPostsCents,
  },
  // The monthly price is set for India rather than converted, and is the net price: 18% GST is charged on top (see
  // plans.tax_rate_basis_points and chargedAmountCents). Extras are still the dollar prices at ₹95 to US$1.
  INR: { monthly: 999_900, extraHour: 142_500, extraBlogPosts: 47_500 },
};

export function planPrice(key: PlanPriceKey, currency: MoneyCurrency): string {
  return formatMoney(planPrices[currency][key], currency);
}

/** For text that can't switch currency (FAQ answers, search snippets): "$75 (₹9,999 in India)". The rupee figure is net of GST. */
export function planPriceInBoth(key: PlanPriceKey): string {
  return `${planPrice(key, "USD")} (${planPrice(key, "INR")} in India)`;
}

/** Visitors in India see rupees; everyone else sees dollars. */
export function currencyForCountry(country: string | null): MoneyCurrency {
  return country?.toUpperCase() === "IN" ? "INR" : "USD";
}
