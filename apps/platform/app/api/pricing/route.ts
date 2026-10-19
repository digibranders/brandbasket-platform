import "server-only";
import { listActivePlans, type BillingCurrency } from "@brandbasket/db";
import { ADD_ONS } from "@brandbasket/shared/lib/billing/add-ons";
import { publicPrices, type PublicPrices } from "@/lib/billing/public-prices";
import { getStaffDb } from "@/lib/server/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";

/** How long the website and any cache in front of it may reuse an answer: prices show up within five minutes. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * `GET /api/pricing`: what is on sale, for the marketing website (docs/plans/11-platform-plans.md in the BrandBasket
 * workspace, 3.8). Public: it is published on the website anyway, and it carries nothing about any customer.
 *
 * `plan` is Managed Website in each currency that has it on sale; `addOns` is the catalogue with each list price, net of
 * GST in paise for rupees and in cents for dollars. The 5% sign-up offer is the website's to show; it is not in here.
 */
export async function GET(): Promise<Response> {
  try {
    const plans = await listActivePlans(getStaffDb());
    const plan: Partial<Record<BillingCurrency, PublicPrices>> = {};
    for (const row of plans) plan[row.currency] = publicPrices(row);
    const addOns = ADD_ONS.map((addOn) => ({ id: addOn.id, title: addOn.title, prices: addOn.prices }));
    return Response.json({ plan, addOns }, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[brandbasket:pricing] GET /api/pricing failed", errorLogInfo(error));
    return Response.json({ error: "Prices are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
