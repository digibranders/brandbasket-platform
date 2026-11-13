import { publicPricing } from "@/platform/lib/billing/public-prices";

/** How long the website and any cache in front of it may reuse an answer: prices show up within five minutes. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * `GET /api/pricing`: what is on sale, for the marketing website (docs/plans/16-platform-pricing-offers.md in the
 * BrandBasket workspace). Public: it is published on the website anyway, and it carries nothing about any customer.
 *
 * `services` is the catalogue with each list price, GST included, in paise for rupees and in cents for dollars (`prices` a month,
 * `annualPrices` a year paid yearly, `annualListPrices` twelve months at the monthly price); `packages` is the offers (none since
 * 2026-11-11); `annualDiscountBasisPoints` is what paying yearly takes off. All come from the shared catalogue, so a change there
 * is the only change.
 */
export async function GET(): Promise<Response> {
  return Response.json(publicPricing(), { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
}
