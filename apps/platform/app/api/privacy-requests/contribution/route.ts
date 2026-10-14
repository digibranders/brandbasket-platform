import { resolveVisitor } from "@/lib/server/directory-visitor";
import { handleContributionDeletion } from "@/lib/server/privacy-request-intake";
import { requestContributionDeletion } from "@/lib/server/privacy-requests";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/privacy-requests/contribution` — a visitor deleting one of their reviews or comments from the Delete link under
 * it. Deleted at once for a visitor the website recognises; otherwise a code is texted and `/confirm` does the deletion.
 * Server-to-server only, with LEADS_API_TOKEN (see lib/server/privacy-request-intake.ts): no CORS.
 */
export function POST(request: Request): Promise<Response> {
  return handleContributionDeletion(request, {
    token: leadsApiToken(),
    resolveVisitorPhone: async (token, now) => (await resolveVisitor(token, now))?.identity.phone ?? null,
    requestDeletion: requestContributionDeletion,
    now: () => new Date(),
  });
}
