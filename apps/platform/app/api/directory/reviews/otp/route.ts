import { handleReviewOtpRequest } from "@/lib/server/directory-intake";
import { resolveVisitor } from "@/lib/server/directory-visitor";
import { publishReviewAsVisitor, requestReviewOtp } from "@/lib/server/directory-reviews";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/reviews/otp` — a visitor's review of a directory business (named by `id` or `key`), held until
 * they confirm the code texted to them. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/directory-intake.ts): no CORS, since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handleReviewOtpRequest(request, { token: leadsApiToken(), requestOtp: requestReviewOtp, resolveVisitor, publishAsVisitor: publishReviewAsVisitor, now: () => new Date() });
}
