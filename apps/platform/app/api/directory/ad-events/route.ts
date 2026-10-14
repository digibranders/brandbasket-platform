import { recordDirectoryAdEvent } from "@/lib/server/directory-ad-events";
import { handleAdEventRequest } from "@/lib/server/directory-intake";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/ad-events` — one sighting or click of a paid ad (named by its advertiser's id and the
 * placement it ran on), counted once per visitor, ad, placement, kind and day for the advertiser's results. Server-to-
 * server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts): no CORS, since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleAdEventRequest(request, { token: leadsApiToken(), recordAdEvent: recordDirectoryAdEvent, now: () => new Date() });
}
