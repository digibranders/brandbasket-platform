import { NextResponse } from "next/server";
import { runSiteAnalyticsRollup } from "@/lib/site-analytics-rollup-run";
import { parseRollupRunRequest } from "@/lib/site-analytics-rollup-request";
import { siteAnalyticsToken } from "@/lib/server/site-analytics-auth";
import { realRollupDeps } from "@/lib/server/site-analytics-rollup";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it writes numbers and deletes old hits.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/roll-up-site-analytics[?dryRun=1]`: the nightly roll-up of the first-party site analytics (plan 56).
 * Called once a night by a scheduled job with `Authorization: Bearer <SITE_ANALYTICS_TOKEN>`; see docs/site-analytics.md.
 * It answers 503 when that secret is not configured, 401 for a missing or wrong one, and 400 for a query it does not
 * understand. Lives under /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  const token = siteAnalyticsToken();
  if (token === null) return NextResponse.json({ error: "The site analytics job is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const parsed = parseRollupRunRequest(new URL(request.url));
  if (parsed === null) return NextResponse.json({ error: "dryRun must be 0 or 1." }, { status: 400 });

  const report = await runSiteAnalyticsRollup(realRollupDeps(), { now: new Date(), dryRun: parsed.dryRun });
  return NextResponse.json(report);
}
