import { NextResponse } from "next/server";
import { retryFailedConversions } from "@/lib/server/conversions";
import { siteAnalyticsToken } from "@/lib/server/site-analytics-auth";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it sends to ad platforms.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/retry-conversions`: reports again each first payment whose send to GA4 or Meta failed (plan 59), for up to
 * a week and five tries. Called by the nightly site analytics job right after its roll-up, with the same secret
 * (`Authorization: Bearer <SITE_ANALYTICS_TOKEN>`). It answers 503 when that secret is not configured and 401 for a missing
 * or wrong one. Lives under /api/, which proxy.ts skips.
 */
export async function POST(request: Request): Promise<Response> {
  const token = siteAnalyticsToken();
  if (token === null) return NextResponse.json({ error: "The nightly job is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  return NextResponse.json(await retryFailedConversions(new Date()));
}
