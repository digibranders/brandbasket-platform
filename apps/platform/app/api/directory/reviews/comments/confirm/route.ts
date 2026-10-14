import { handleReviewConfirmRequest } from "@/lib/server/directory-intake";
import { confirmCommentOtp } from "@/lib/server/directory-review-actions";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/reviews/comments/confirm` — the code from the text, which publishes the comment it was holding.
 * Answers exactly like `/api/directory/reviews/confirm`. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/directory-intake.ts): no CORS, since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleReviewConfirmRequest(request, { token: leadsApiToken(), confirmOtp: confirmCommentOtp, now: () => new Date() });
}
