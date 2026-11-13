import { resolveVisitor } from "@/platform/lib/server/directory-visitor";
import { handleOwnContributions } from "@/platform/lib/server/privacy-request-intake";
import { listOwnContributions } from "@/platform/lib/server/privacy-requests";
import { leadsApiToken } from "@/platform/lib/server/website-api-auth";

/**
 * `POST /api/privacy-requests/contribution/mine`, which of a business page's reviews, and which comments on them, a
 * remembered visitor wrote, so the page shows "Delete" under those alone. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/privacy-request-intake.ts): no CORS.
 */
export function POST(request: Request): Promise<Response> {
  return handleOwnContributions(request, {
    token: leadsApiToken(),
    resolveVisitorPhone: async (token, now) => (await resolveVisitor(token, now))?.identity.phone ?? null,
    listMine: listOwnContributions,
    now: () => new Date(),
  });
}
