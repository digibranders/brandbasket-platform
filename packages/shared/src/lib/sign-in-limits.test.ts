import { describe, expect, it } from "vitest";
import { retryMessage, signInRateLimitChecks } from "./sign-in-limits";

describe("signInRateLimitChecks", () => {
  it("checks the network first, then the account from that network, then the account overall", () => {
    expect(signInRateLimitChecks("owner@example.com", "203.0.113.7")).toEqual([
      { key: "sign-in:client:203.0.113.7", rule: { limit: 20, windowSeconds: 900 } },
      {
        key: "sign-in:account-client:owner@example.com:203.0.113.7",
        rule: { limit: 8, windowSeconds: 900 },
      },
      { key: "sign-in:account:owner@example.com", rule: { limit: 50, windowSeconds: 900 } },
    ]);
  });

  it("does not vary the keys by calling surface, since staff and customer sign-in share one account budget", () => {
    const keys = signInRateLimitChecks("owner@example.com", "203.0.113.7").map((check) => check.key);
    for (const key of keys) {
      expect(key).not.toMatch(/customer|staff/);
    }
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes, never less than one", () => {
    expect(retryMessage(1)).toBe("Too many sign-in attempts. Try again in 1 minute.");
    expect(retryMessage(61)).toBe("Too many sign-in attempts. Try again in 2 minutes.");
    expect(retryMessage(900)).toBe("Too many sign-in attempts. Try again in 15 minutes.");
  });
});
