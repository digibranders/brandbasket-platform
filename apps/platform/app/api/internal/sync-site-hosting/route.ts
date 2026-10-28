import { NextResponse } from "next/server";
import { siteHostingSyncToken, syncSiteHosting } from "@/lib/server/site-hosting";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

// Never cached or prerendered: it pauses and unpauses real websites.
export const dynamic = "force-dynamic";

/**
 * `POST /api/internal/sync-site-hosting[?dryRun=1]`: pauses the hosting project of every client whose website has ended
 * and unpauses the ones that paid (docs/site-hosting.md). Called hourly by a scheduled job with
 * `Authorization: Bearer <SITE_HOSTING_SYNC_TOKEN>`. It answers 503 when that secret is not configured, 401 for a missing or
 * wrong one and 400 for a query it does not understand. The report is the body. The status says whether a person needs to
 * look: 409 when the brake stopped a batch of pauses, 502 when the host refused a change, 200 otherwise. Lives under /api/,
 * which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  const token = siteHostingSyncToken();
  if (token === null) return NextResponse.json({ error: "The hosting sync is not configured." }, { status: 503 });
  if (!hasValidWebsiteToken(request, token)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const dryParam = new URL(request.url).searchParams.get("dryRun");
  if (dryParam !== null && dryParam !== "1" && dryParam !== "0") {
    return NextResponse.json({ error: "dryRun must be 0 or 1." }, { status: 400 });
  }

  const report = await syncSiteHosting({ dryRun: dryParam === "1" });
  const status = report.braked ? 409 : report.failed > 0 ? 502 : 200;
  return NextResponse.json(report, { status });
}
