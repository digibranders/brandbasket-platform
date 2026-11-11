import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { rateLimitBuckets } from "./schema";

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isSafeInteger(rule.limit) || rule.limit < 1) {
    throw new RangeError(`Rate limit must be a positive whole number, received ${rule.limit}`);
  }
  if (!Number.isSafeInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError(`Rate limit window must be a positive whole number of seconds, received ${rule.windowSeconds}`);
  }
}

export function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Stored form of a rate-limit key: fixed length (43 chars) and free of
 * personal data such as emails or IP addresses.
 */
export function bucketKeyFor(key: string): string {
  return createHash("sha256").update(key).digest("base64url");
}

/**
 * Records one hit for `key` and reports whether it is within the rule. Atomic under concurrent hits.
 *
 * Call outside a transaction: inside one, row locks on busy keys are held until commit.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (key.trim() === "") throw new RangeError("Rate limit key must not be empty");
  if (!Number.isFinite(now.getTime())) throw new RangeError("Rate limit time must be a valid Date");
  assertValidRule(rule);

  const bucketKey = bucketKeyFor(key);
  const windowStart = windowStartFor(now, rule.windowSeconds);
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key: bucketKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  const hits = rows[0]?.count;
  if (hits === undefined) throw new Error("Rate limit upsert returned no row");

  await db
    .delete(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, bucketKey), lt(rateLimitBuckets.windowStart, windowStart)));

  if (hits <= rule.limit) {
    return { allowed: true, remaining: rule.limit - hits, retryAfterSeconds: 0 };
  }
  const windowEndMs = windowStart.getTime() + rule.windowSeconds * 1000;
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowEndMs - now.getTime()) / 1000) };
}
