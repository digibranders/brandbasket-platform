import { describe, expect, it } from "vitest";
import { PREVIEW_LINK_SECONDS, previewLink, previewSignature } from "@/lib/preview-link";

const SECRET = "a-shared-secret-that-is-long-enough-123";

describe("previewSignature", () => {
  // The same value is asserted in the website's lib/preview-token.test.ts: the two sides must agree on it.
  it("matches the website's signature for the same business and expiry", () => {
    expect(previewSignature(SECRET, "abc234", 1_800_003_600)).toBe("Vk7UnFtjzSEj3Bjb_c2CkrVpjGTu38Okey5iybEmZXg");
  });

  it("changes with the business, the expiry and the secret", () => {
    const base = previewSignature(SECRET, "abc234", 1_800_003_600);
    expect(previewSignature(SECRET, "zzz999", 1_800_003_600)).not.toBe(base);
    expect(previewSignature(SECRET, "abc234", 1_800_003_601)).not.toBe(base);
    expect(previewSignature("another-secret-that-is-long-enough-456", "abc234", 1_800_003_600)).not.toBe(base);
  });
});

describe("previewLink", () => {
  it("is the website's preview address, good for a few hours and signed", () => {
    const now = new Date("2027-01-15T08:00:00Z");
    const url = new URL(previewLink({ websiteOrigin: "https://brandbasket.in", code: "abc234", secret: SECRET, now }));
    const expires = Math.floor(now.getTime() / 1000) + PREVIEW_LINK_SECONDS;
    expect(url.origin + url.pathname).toBe("https://brandbasket.in/preview/business/abc234");
    expect(url.searchParams.get("e")).toBe(String(expires));
    expect(url.searchParams.get("s")).toBe(previewSignature(SECRET, "abc234", expires));
  });
});
