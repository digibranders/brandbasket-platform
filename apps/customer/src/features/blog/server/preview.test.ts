import { describe, expect, it } from "vitest";
import { blogPreviewUrl, signBlogPreviewToken } from "./preview";

const SECRET = "a-test-secret-that-is-long-enough-000";
const NOW = new Date("2026-09-24T10:00:00.000Z");
const CLAIMS = { businessId: "0192f3c4-aaaa-7000-8000-00000000000a", postId: "42" };
/** Signed by apps/platform lib/server/blog-preview-token.ts with the same inputs: the platform verifies what this app signs. */
const PLATFORM_TOKEN =
  "eyJiIjoiMDE5MmYzYzQtYWFhYS03MDAwLTgwMDAtMDAwMDAwMDAwMDBhIiwicCI6IjQyIiwiZSI6MTc5MDI0NTgwMDAwMH0.QA2pB3GFK1ns3XpfHKO9XIwK7_WJZ0sZZBueYzYmTiM";

describe("blog preview tokens", () => {
  it("are exactly what the platform signs, so its preview endpoint accepts them", () => {
    expect(signBlogPreviewToken(SECRET, CLAIMS, NOW)).toBe(PLATFORM_TOKEN);
  });

  it("carry the business, the post and a 30 minute expiry", () => {
    const [claims] = signBlogPreviewToken(SECRET, CLAIMS, NOW).split(".");
    expect(JSON.parse(Buffer.from(claims ?? "", "base64url").toString("utf8"))).toEqual({ b: CLAIMS.businessId, p: "42", e: NOW.getTime() + 30 * 60 * 1000 });
  });

  it("differ for another secret", () => {
    expect(signBlogPreviewToken("another-secret-that-is-long-enough-1", CLAIMS, NOW)).not.toBe(PLATFORM_TOKEN);
  });
});

describe("blogPreviewUrl", () => {
  it("opens the site's own preview page with the token", () => {
    const url = new URL(blogPreviewUrl(SECRET, "https://asterphysio.com/some/page", CLAIMS, NOW));
    expect(url.origin + url.pathname).toBe("https://asterphysio.com/blog/preview");
    expect(url.searchParams.get("token")).toBe(PLATFORM_TOKEN);
  });
});
