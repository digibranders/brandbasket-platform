import { describe, expect, it } from "vitest";
import { assertValidRule, bucketKeyFor, windowStartFor } from "./rate-limit";

describe("windowStartFor", () => {
  it("floors the time to the start of its window", () => {
    const now = new Date("2026-09-15T10:07:42.500Z");
    expect(windowStartFor(now, 15 * 60).toISOString()).toBe("2026-09-15T10:00:00.000Z");
    expect(windowStartFor(now, 60).toISOString()).toBe("2026-09-15T10:07:00.000Z");
  });

  it("starts a new window exactly on the boundary", () => {
    const boundary = new Date("2026-09-15T10:15:00.000Z");
    expect(windowStartFor(boundary, 15 * 60).toISOString()).toBe("2026-09-15T10:15:00.000Z");
  });
});

describe("bucketKeyFor", () => {
  it("returns the same 43-character base64url value for the same input", () => {
    const first = bucketKeyFor("sign-in:customer:client:203.0.113.7");
    const second = bucketKeyFor("sign-in:customer:client:203.0.113.7");
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns different values for different inputs", () => {
    expect(bucketKeyFor("key-a")).not.toBe(bucketKeyFor("key-b"));
  });

  it("returns a 43-character result for a 10,000-character input", () => {
    const longKey = "a".repeat(10_000);
    expect(bucketKeyFor(longKey)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("assertValidRule", () => {
  it("accepts positive whole numbers", () => {
    expect(() => assertValidRule({ limit: 5, windowSeconds: 60 })).not.toThrow();
  });

  it("rejects zero, negative and fractional values", () => {
    expect(() => assertValidRule({ limit: 0, windowSeconds: 60 })).toThrow(RangeError);
    expect(() => assertValidRule({ limit: 5, windowSeconds: -1 })).toThrow(RangeError);
    expect(() => assertValidRule({ limit: 1.5, windowSeconds: 60 })).toThrow(RangeError);
  });
});
