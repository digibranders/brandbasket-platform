import "server-only";
import { consumeRateLimit } from "@brandbasket/db";
import { getStaffDb } from "./db";

/**
 * How often one person may send support requests and replies. Returns the sentence to show when they have sent too many, or
 * null when they may go ahead. Counted on the staff connection (the rate-limit table is not the customer role's).
 */
export async function supportRateLimit(userId: string, reply: boolean): Promise<string | null> {
  const rules = reply
    ? [{ key: "reply", limit: 30, windowSeconds: 3600 }]
    : [
        { key: "create-short", limit: 5, windowSeconds: 600 },
        { key: "create-day", limit: 20, windowSeconds: 86400 },
      ];
  for (const rule of rules) {
    const result = await consumeRateLimit(getStaffDb(), `support:${rule.key}:${userId}`, rule);
    if (!result.allowed) return `Please wait ${result.retryAfterSeconds} seconds before sending another request.`;
  }
  return null;
}
