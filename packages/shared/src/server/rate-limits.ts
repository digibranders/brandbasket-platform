import "server-only";
import { consumeRateLimit, type Database, type RateLimitResult } from "@firstfold/db";
import { signInRateLimitChecks } from "../lib/sign-in-limits";

/**
 * Consumes each sign-in limit in order and returns the first block, or null when every limit allows the attempt.
 * If the limiter itself fails, the error propagates and the caller fails closed rather than skipping the limits.
 *
 * Shared by every surface that checks a password, so the budget for an account is one budget: the setup page's
 * recovery path cannot be used to guess a password more cheaply than the sign-in page can.
 * `email` must already be normalised (trimmed, lowercase), as parseSignInForm does.
 */
export async function firstBlockedSignInLimit(
  db: Database,
  email: string,
  clientIp: string,
): Promise<RateLimitResult | null> {
  for (const check of signInRateLimitChecks(email, clientIp)) {
    const result = await consumeRateLimit(db, check.key, check.rule);
    if (!result.allowed) return result;
  }
  return null;
}
