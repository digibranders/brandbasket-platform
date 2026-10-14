import "server-only";
import { listActivePlans, type BillingCurrency } from "@firstfold/db";
import { publicPrices, type PublicPrices } from "@/lib/billing/public-prices";
import { getStaffDb } from "@/lib/server/db";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";

/** How long the website and any cache in front of it may reuse an answer: prices show up within five minutes. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * `GET /api/pricing` — the prices on sale in each currency, for the marketing website. Public: they are published
 * on the website anyway, and it carries nothing about any customer. A currency with no plan on sale is left out.
 *
 * `prices` is Premium's, as it always was, so the website keeps working unchanged; `carePrices` is the Care plan's,
 * in the currencies that have one (docs/superpowers/specs/2026-10-07-care-plan-design.md).
 */
export async function GET(): Promise<Response> {
  try {
    const plans = await listActivePlans(getStaffDb());
    const prices: Partial<Record<BillingCurrency, PublicPrices>> = {};
    const carePrices: Partial<Record<BillingCurrency, PublicPrices>> = {};
    for (const plan of plans) (plan.tier === "care" ? carePrices : prices)[plan.currency] = publicPrices(plan);
    return Response.json({ prices, carePrices }, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[firstfold:pricing] GET /api/pricing failed", errorLogInfo(error));
    return Response.json({ error: "Prices are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
