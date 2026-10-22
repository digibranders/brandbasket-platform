import { describe, expect, it } from "vitest";
import { PRICING_NOTICES, readPricingNotice } from "./pricing-notices";

describe("the pricing page's notices", () => {
  it("say what a save did to the extras, with no word of a monthly price or a provider plan", () => {
    expect(PRICING_NOTICES["extras-updated"]).toEqual({ text: "Saved. New extras are charged at these prices; extras already added keep theirs.", ok: true });
    expect(Object.keys(PRICING_NOTICES)).not.toEqual(expect.arrayContaining(["monthly-updated", "below-referral", "provider-failed", "invalid-monthly"]));
  });

  it("read only a notice that exists", () => {
    expect(readPricingNotice("extras-updated")).toBe("extras-updated");
    expect(readPricingNotice("monthly-updated")).toBeNull();
    expect(readPricingNotice(["extras-updated"])).toBeNull();
  });
});
