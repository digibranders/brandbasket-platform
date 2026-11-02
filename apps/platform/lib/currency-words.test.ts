import { describe, expect, it } from "vitest";
import { pricesNote } from "./currency-words";

describe("pricesNote", () => {
  it("keeps the rupee wording exactly for a taxed plan", () => {
    expect(pricesNote("INR", true)).toBe("Prices are in rupees and include GST.");
  });

  it("says dollars and never mentions GST for a plan with no tax", () => {
    expect(pricesNote("USD", false)).toBe("Prices are in dollars.");
    expect(pricesNote("USD", false)).not.toMatch(/gst/i);
  });
});
