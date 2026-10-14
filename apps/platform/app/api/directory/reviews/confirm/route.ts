import { handleReviewConfirmRequest } from "@/lib/server/directory-intake";
import { confirmReviewOtp } from "@/lib/server/directory-reviews";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/reviews/confirm` — the code a reviewer was texted, which publishes their review.
 * Server-to-server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts): no CORS.
 */
export function POST(request: Request): Promise<Response> {
  return handleReviewConfirmRequest(request, { token: leadsApiToken(), confirmOtp: confirmReviewOtp, now: () => new Date() });
}
