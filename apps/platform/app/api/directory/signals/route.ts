import { handleSignalsRequest } from "@/lib/server/directory-intake";
import { readSignals } from "@/lib/server/directory-signals";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `GET /api/directory/signals?ids=i1,i2,…` and/or `?keys=k1,k2,…` — which of up to 50 directory businesses are
 * Trending today and which show a paid tag this week ("Hot & New · Ad"), keyed by what was asked, for the marketing
 * website's list and business pages. Server-to-server
 * only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts); lives under /api/, which proxy.ts skips, so it
 * answers on either dashboard host.
 */
export function GET(request: Request): Promise<Response> {
  return handleSignalsRequest(request, { token: leadsApiToken(), readSignals, now: () => new Date() });
}
