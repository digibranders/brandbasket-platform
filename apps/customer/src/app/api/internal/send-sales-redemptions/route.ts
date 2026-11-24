import { NextResponse } from "next/server";
import { deliverSalesRedemptions } from "@/platform/lib/server/fynix-webhook";
import { siteAnalyticsToken } from "@/platform/lib/server/site-analytics-auth";
import { hasValidWebsiteToken } from "@/platform/lib/server/website-api-auth";

// Never cached or prerendered: it posts to Fynix Sales.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/send-sales-redemptions`: tells Fynix Sales about each paid coupon redemption it has not yet accepted,
 * backing off between tries. Meant for a timer every minute or so, with the same bearer secret as the other internal jobs
 * (`SITE_ANALYTICS_TOKEN`). 503 when that secret is not configured, 401 for a missing or wrong one. Lives under /api/, which proxy.ts skips.
 */
export async function POST(request: Request): Promise<Response> {
  const token = siteAnalyticsToken();
  if (token === null) return NextResponse.json({ error: "The internal jobs are not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  return NextResponse.json(await deliverSalesRedemptions(new Date()));
}
