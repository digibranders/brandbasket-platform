import { readAdsForWebsite } from "@/lib/server/directory-ads";
import { handleAdsRequest } from "@/lib/server/directory-intake";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `GET /api/directory/ads?market=<category>/<city>/<area>` — the market's paid ads this week (the list's top row and
 * the side column's spots, each with its advertiser's key and permanent id), for the marketing website's list pages.
 * Settles any auction that is due first. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/directory-intake.ts); lives under /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export function GET(request: Request): Promise<Response> {
  return handleAdsRequest(request, { token: leadsApiToken(), readAds: readAdsForWebsite, now: () => new Date() });
}
