import { describe, expect, it, vi } from "vitest";
import { issueVisitorToken, verifyVisitorToken, VISITOR_TOKEN_TTL_SECONDS } from "./visitor-token";

vi.mock("server-only", () => ({}));

const SECRET = "a".repeat(40);
const ID = "01939c54-1111-7222-8333-444455556666";
const NOW = new Date("2026-10-09T10:00:00.000Z");

describe("visitor tokens", () => {
  it("names the visitor it was issued for", () => {
    expect(verifyVisitorToken(issueVisitorToken(ID, NOW, SECRET), NOW, SECRET)).toBe(ID);
  });

  it("stops working after thirty days", () => {
    const token = issueVisitorToken(ID, NOW, SECRET);
    const justBefore = new Date(NOW.getTime() + (VISITOR_TOKEN_TTL_SECONDS - 1) * 1000);
    const atExpiry = new Date(NOW.getTime() + VISITOR_TOKEN_TTL_SECONDS * 1000);
    expect(verifyVisitorToken(token, justBefore, SECRET)).toBe(ID);
    expect(verifyVisitorToken(token, atExpiry, SECRET)).toBeNull();
  });

  it("refuses a token signed with another key", () => {
    expect(verifyVisitorToken(issueVisitorToken(ID, NOW, "b".repeat(40)), NOW, SECRET)).toBeNull();
  });

  it("refuses a token whose visitor or expiry was changed", () => {
    const [, expiry, sig] = issueVisitorToken(ID, NOW, SECRET).split(".") as [string, string, string];
    const other = "01939c54-1111-7222-8333-444455557777";
    expect(verifyVisitorToken(`${other}.${expiry}.${sig}`, NOW, SECRET)).toBeNull();
    expect(verifyVisitorToken(`${ID}.${Number(expiry) + 999_999}.${sig}`, NOW, SECRET)).toBeNull();
  });

  it("refuses anything that is not a token", () => {
    for (const bad of ["", "abc", "a.b", `${ID}.x.y`, `${ID}.${"9".repeat(20)}.sig`, `${ID}.1.2.3`]) {
      expect(verifyVisitorToken(bad, NOW, SECRET)).toBeNull();
    }
  });
});
