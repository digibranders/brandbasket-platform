import { describe, expect, it } from "vitest";
import { hashLinkToken, looksLikeLinkToken, newLinkToken } from "./link-token";

describe("payment link tokens", () => {
  it("makes a 43 character base64url token that is different each time", () => {
    const first = newLinkToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(looksLikeLinkToken(first)).toBe(true);
    expect(newLinkToken()).not.toBe(first);
  });

  it("hashes to a stable 64 character hex string that is not the token", () => {
    const token = newLinkToken();
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).not.toContain(token);
    expect(hashLinkToken("a")).not.toBe(hashLinkToken("b"));
  });

  it("recognises only tokens of the right shape", () => {
    expect(looksLikeLinkToken("")).toBe(false);
    expect(looksLikeLinkToken("short")).toBe(false);
    expect(looksLikeLinkToken("a".repeat(44))).toBe(false);
    expect(looksLikeLinkToken(`${"a".repeat(42)}!`)).toBe(false);
  });
});
