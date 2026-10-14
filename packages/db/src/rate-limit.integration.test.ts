import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bucketKeyFor, consumeRateLimit } from "./rate-limit";
import { rateLimitBuckets } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const RULE = { limit: 2, windowSeconds: 60 };
const KEY = "sign-in:customer:client:203.0.113.7";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("consumeRateLimit", () => {
  it("allows hits up to the limit, then blocks with a retry time", async () => {
    const now = new Date("2026-09-15T10:00:15.000Z");

    const first = await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    const second = await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    const third = await consumeRateLimit(dbs.app.db, KEY, RULE, now);

    expect(first).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(third).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 45 });
  });

  it("counts keys independently", async () => {
    const now = new Date("2026-09-15T10:00:00.000Z");
    await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    await consumeRateLimit(dbs.app.db, KEY, RULE, now);

    const other = await consumeRateLimit(dbs.app.db, "sign-in:customer:client:198.51.100.1", RULE, now);

    expect(other.allowed).toBe(true);
  });

  it("resets in the next window and removes the old window's row", async () => {
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:10.000Z"));
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:20.000Z"));
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:30.000Z"));

    const nextWindow = await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:01:05.000Z"));
    const rows = await dbs.app.db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, bucketKeyFor(KEY)));

    expect(nextWindow).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowStart.toISOString()).toBe("2026-09-15T10:01:00.000Z");
  });

  it("accepts a very long key without failing", async () => {
    const longKey = "a".repeat(10_000);
    const now = new Date("2026-09-15T10:00:00.000Z");

    const result = await consumeRateLimit(dbs.app.db, longKey, RULE, now);

    expect(result).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  });

  it("stores no raw key", async () => {
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:00.000Z"));

    const rows = await dbs.app.db.select().from(rateLimitBuckets);

    expect(rows.some((row) => row.key === KEY)).toBe(false);
    expect(rows.filter((row) => row.key === bucketKeyFor(KEY))).toHaveLength(1);
  });

  it("counts concurrent hits exactly", async () => {
    const now = new Date("2026-09-15T10:00:00.000Z");
    const concurrentRule = { limit: 3, windowSeconds: 60 };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(dbs.app.db, KEY, concurrentRule, now)),
    );

    const rows = await dbs.app.db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, bucketKeyFor(KEY)));

    expect(results.filter((result) => result.allowed === true)).toHaveLength(3);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(10);
  });

  it("rejects an empty key", async () => {
    await expect(consumeRateLimit(dbs.app.db, " ", RULE)).rejects.toThrow(RangeError);
    await expect(consumeRateLimit(dbs.app.db, " ", RULE)).rejects.toThrow("Rate limit key must not be empty");
  });

  it("rejects an invalid time", async () => {
    await expect(consumeRateLimit(dbs.app.db, KEY, RULE, new Date("invalid"))).rejects.toThrow(RangeError);
  });
});
