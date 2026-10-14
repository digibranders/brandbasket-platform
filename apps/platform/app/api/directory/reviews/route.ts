import { handleReviewsRequest } from "@/lib/server/directory-intake";
import { readReviews } from "@/lib/server/directory-reviews";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `GET /api/directory/reviews?id=…&page=1` (permanent id) or `?key=…&page=1` (listing key) — one directory business's
 * rating summary and a page of its published reviews, for the marketing website's business pages. Server-to-server only, with LEADS_API_TOKEN (see
 * lib/server/directory-intake.ts).
 */
export function GET(request: Request): Promise<Response> {
  return handleReviewsRequest(request, { token: leadsApiToken(), readReviews });
}
