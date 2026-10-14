import "server-only";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";

/**
 * The secret the daily erase job sends as `Authorization: Bearer <token>`. Its own secret, not LEADS_API_TOKEN: that one
 * is shared with the marketing website, and this one permanently deletes accounts. Unset or too short means the route
 * refuses every request, so a deployment that never configured it cannot be asked to erase anything.
 */
export function accountEraseToken(): string | null {
  const token = process.env.ACCOUNT_ERASE_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}
