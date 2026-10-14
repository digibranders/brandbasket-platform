import { handleCommentOtpRequest } from "@/lib/server/directory-intake";
import { publishCommentAsVisitor, requestCommentOtp } from "@/lib/server/directory-review-actions";
import { resolveVisitor } from "@/lib/server/directory-visitor";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/reviews/comments/otp` — a visitor's comment on a published review, held until they confirm the
 * code sent to them. Server-to-server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts): no CORS,
 * since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleCommentOtpRequest(request, { token: leadsApiToken(), requestOtp: requestCommentOtp, resolveVisitor, publishAsVisitor: publishCommentAsVisitor, now: () => new Date() });
}
