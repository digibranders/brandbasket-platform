import { describe, expect, it, vi } from "vitest";
import { packGoogleFlow, unpackGoogleFlow, type GoogleFlow } from "./google-flow";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-03T04:00:00.000Z");
const FLOW: GoogleFlow = { purpose: "read", state: "a".repeat(32), verifier: "b".repeat(64), staffId: "staff-1", expiresAt: NOW.getTime() + 60_000 };

describe("the Google sign-in cookie", () => {
  it("round trips for the same staff member before it expires", () => {
    expect(unpackGoogleFlow(SECRET, packGoogleFlow(SECRET, FLOW), "staff-1", NOW)).toEqual(FLOW);
  });
  it("is refused when expired, altered, signed with another secret, or opened by someone else", () => {
    const cookie = packGoogleFlow(SECRET, FLOW);
    expect(unpackGoogleFlow(SECRET, cookie, "staff-1", new Date(NOW.getTime() + 120_000))).toBeNull();
    expect(unpackGoogleFlow(SECRET, cookie, "staff-2", NOW)).toBeNull();
    expect(unpackGoogleFlow("t".repeat(40), cookie, "staff-1", NOW)).toBeNull();
    const [payload, signature] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ ...FLOW, purpose: "write" })).toString("base64url");
    expect(unpackGoogleFlow(SECRET, `${forged}.${signature}`, "staff-1", NOW)).toBeNull();
    expect(unpackGoogleFlow(SECRET, `${payload}.x`, "staff-1", NOW)).toBeNull();
    expect(unpackGoogleFlow(SECRET, undefined, "staff-1", NOW)).toBeNull();
    expect(unpackGoogleFlow(SECRET, "garbage", "staff-1", NOW)).toBeNull();
  });
});
