import { describe, expect, it } from "vitest";
import { LEGAL_TEXT_VERSION } from "./notice-version";

describe("LEGAL_TEXT_VERSION", () => {
  it("is a short label that fits a consent record", () => {
    expect(LEGAL_TEXT_VERSION.length).toBeGreaterThan(0);
    expect(LEGAL_TEXT_VERSION.length).toBeLessThanOrEqual(40);
  });

  it("is the dated label the website's privacy policy shows, not the one used before the policy was updated", () => {
    expect(LEGAL_TEXT_VERSION).toBe("2026-10-13.5");
  });
});
