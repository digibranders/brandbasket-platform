import { handleRatingsRequest } from "@/lib/server/directory-intake";
import { readRatings } from "@/lib/server/directory-reviews";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `GET /api/directory/ratings?ids=i1,i2,…` (permanent ids) and/or `?keys=k1,k2,…` (listing keys, until the website
 * has switched) — the rating summary of up to 50 directory businesses, keyed by what was asked, for the marketing
 * website's list pages. Server-to-server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts); lives under
 * /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export function GET(request: Request): Promise<Response> {
  return handleRatingsRequest(request, { token: leadsApiToken(), readRatings });
}
