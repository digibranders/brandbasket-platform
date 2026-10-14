import { handleReviewHelpfulRequest } from "@/lib/server/directory-intake";
import { markReviewHelpful } from "@/lib/server/directory-review-actions";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/reviews/helpful` — one visitor found a published review helpful, counted once a week per
 * visitor and review. Server-to-server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts): no CORS,
 * since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleReviewHelpfulRequest(request, { token: leadsApiToken(), markHelpful: markReviewHelpful, now: () => new Date() });
}
