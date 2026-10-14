import { handleEventRequest } from "@/lib/server/directory-intake";
import { recordDirectoryEvent } from "@/lib/server/directory-signals";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/events` — one page view or contact tap on a directory business (named by `id` or `key`), counted
 * (once per visitor, business, kind and day) towards the Trending tag. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/directory-intake.ts): no CORS, since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleEventRequest(request, { token: leadsApiToken(), recordEvent: recordDirectoryEvent, now: () => new Date() });
}
