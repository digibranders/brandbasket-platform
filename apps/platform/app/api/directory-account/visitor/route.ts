import { startVisitorSession } from "@/lib/server/directory-visitor";
import { getSessionUser } from "@/lib/server/session";
import { handleVisitorHandoffRequest } from "@/lib/server/visitor-handoff-request";
import { websiteOrigin } from "@/lib/server/website-origin";

/**
 * `GET /api/directory-account/visitor` — the signed-in dashboard account, handed to the website as a visitor so its
 * review, comment and enquiry forms post under the account's name and proven number with no code. Called by the person's
 * own browser from the website, with the dashboard's session cookie: only the website's origin is let in (see
 * lib/server/visitor-handoff-request.ts).
 */
function handle(request: Request): Promise<Response> {
  return handleVisitorHandoffRequest(request, {
    websiteOrigin: websiteOrigin(),
    getSessionUser,
    startVisitor: startVisitorSession,
    now: () => new Date(),
  });
}

export const GET = handle;
export const OPTIONS = handle;
