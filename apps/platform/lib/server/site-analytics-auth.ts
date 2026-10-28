import "server-only";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";

/**
 * The secret the nightly site analytics job sends as `Authorization: Bearer <token>`. Its own secret: it deletes the old
 * raw hits, and the other internal tokens guard other things. Unset or too short means the route refuses every request.
 */
export function siteAnalyticsToken(): string | null {
  const token = process.env.SITE_ANALYTICS_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}
