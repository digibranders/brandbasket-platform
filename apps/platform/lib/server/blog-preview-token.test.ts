import { describe, expect, it } from "vitest";
import { BLOG_PREVIEW_TTL_MS, signBlogPreviewToken, verifyBlogPreviewToken } from "./blog-preview-token";

const SECRET = "a-test-secret-that-is-long-enough-000";
const NOW = new Date("2026-09-24T10:00:00.000Z");
const CLAIMS = { businessId: "0192f3c4-aaaa-7000-8000-00000000000a", postId: "42" };

describe("blog preview tokens", () => {
  it("round-trips the business and the post", () => {
    const token = signBlogPreviewToken(SECRET, CLAIMS, NOW);
    expect(verifyBlogPreviewToken(SECRET, token, NOW)).toEqual(CLAIMS);
  });

  it("is URL-safe", () => {
    expect(signBlogPreviewToken(SECRET, CLAIMS, NOW)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("stops working once it expires", () => {
    const token = signBlogPreviewToken(SECRET, CLAIMS, NOW);
    const justBefore = new Date(NOW.getTime() + BLOG_PREVIEW_TTL_MS - 1);
    const atExpiry = new Date(NOW.getTime() + BLOG_PREVIEW_TTL_MS);
    expect(verifyBlogPreviewToken(SECRET, token, justBefore)).toEqual(CLAIMS);
    expect(verifyBlogPreviewToken(SECRET, token, atExpiry)).toBeNull();
  });

  it("refuses a token signed with another secret", () => {
    const token = signBlogPreviewToken("another-secret-that-is-long-enough-1", CLAIMS, NOW);
    expect(verifyBlogPreviewToken(SECRET, token, NOW)).toBeNull();
  });

  it("refuses a token whose claims were edited", () => {
    const [, signature] = signBlogPreviewToken(SECRET, CLAIMS, NOW).split(".");
    const forged = Buffer.from(JSON.stringify({ b: CLAIMS.businessId, p: "43", e: NOW.getTime() + 60_000 })).toString("base64url");
    expect(verifyBlogPreviewToken(SECRET, `${forged}.${signature}`, NOW)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "not-base64!.x", `${Buffer.from("[]").toString("base64url")}.x`])(
    "refuses malformed input %j without throwing",
    (token) => {
      expect(verifyBlogPreviewToken(SECRET, token, NOW)).toBeNull();
    },
  );
});
