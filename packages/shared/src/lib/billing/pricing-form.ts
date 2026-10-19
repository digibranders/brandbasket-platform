import type { BillingCurrency, PlanTier } from "@brandbasket/db";
import { parseMoney } from "../money";

export const PRICING_CURRENCY_FIELD = "currency";
export const PRICING_TIER_FIELD = "tier";
export const PRICING_MONTHLY_FIELD = "monthly";
export const PRICING_EXTRA_HOUR_FIELD = "extraHour";
export const PRICING_EXTRA_PUBLISH_FIELD = "extraPublish";
export const PRICING_EXTRA_BLOG_POSTS_FIELD = "extraBlogPosts";

/** Largest price the form accepts, in minor units: a typo guard, far above any real price. */
export const MAX_FORM_PRICE_CENTS = 10_000_000;

/**
 * One plan's prices in one currency as staff set them: net of tax, in minor units. The monthly price is the plan's own
 * (Care's and Premium's are set separately); the extras are the same for both plans and are set on both.
 */
export interface PriceSheet {
  readonly currency: BillingCurrency;
  readonly tier: PlanTier;
  readonly monthlyCents: number;
  readonly extraHourCents: number;
  readonly extraPublishCents: number;
  readonly extraBlogPostsCents: number;
}

export type PricingFormProblem =
  | "invalid-currency"
  | "invalid-tier"
  | "invalid-monthly"
  | "invalid-extra-hour"
  | "invalid-extra-publish"
  | "invalid-extra-blog-posts";

export type PricingForm = { readonly ok: true; readonly sheet: PriceSheet } | { readonly ok: false; readonly problem: PricingFormProblem };

function price(formData: FormData, field: string): number | null {
  const value = formData.get(field);
  const cents = typeof value === "string" ? parseMoney(value) : null;
  return cents === null || cents < 1 || cents > MAX_FORM_PRICE_CENTS ? null : cents;
}

/**
 * Reads the staff console's pricing form for one plan in one currency. Every price is required and must be above zero; amounts
 * are typed as people write them ("2,999" or "69.50") and are before GST, which is added on top for India.
 */
export function parsePricingForm(formData: FormData): PricingForm {
  const currency = formData.get(PRICING_CURRENCY_FIELD);
  if (currency !== "USD" && currency !== "INR") return { ok: false, problem: "invalid-currency" };
  const tier = formData.get(PRICING_TIER_FIELD);
  if (tier !== "care" && tier !== "premium") return { ok: false, problem: "invalid-tier" };
  const monthlyCents = price(formData, PRICING_MONTHLY_FIELD);
  if (monthlyCents === null) return { ok: false, problem: "invalid-monthly" };
  const extraHourCents = price(formData, PRICING_EXTRA_HOUR_FIELD);
  if (extraHourCents === null) return { ok: false, problem: "invalid-extra-hour" };
  const extraPublishCents = price(formData, PRICING_EXTRA_PUBLISH_FIELD);
  if (extraPublishCents === null) return { ok: false, problem: "invalid-extra-publish" };
  const extraBlogPostsCents = price(formData, PRICING_EXTRA_BLOG_POSTS_FIELD);
  if (extraBlogPostsCents === null) return { ok: false, problem: "invalid-extra-blog-posts" };
  return { ok: true, sheet: { currency, tier, monthlyCents, extraHourCents, extraPublishCents, extraBlogPostsCents } };
}

/** An amount in minor units as the form shows it back: "2999", or "69.50" when it has cents. */
export function formPriceValue(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
