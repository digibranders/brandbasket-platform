import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS, pressReleaseChargeDescription } from "./add-ons";

describe("add-on catalogue", () => {
  it("sells two monthly services and one one-time service, dearest first", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.billing])).toEqual([
      ["local-seo", "monthly"],
      ["performance-marketing", "monthly"],
      ["press-release", "one-time"],
    ]);
    expect(MONTHLY_ADD_ON_IDS).toEqual(["local-seo", "performance-marketing"]);
    expect(isMonthlyAddOnId("press-release")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  it("prices without a discount: list price plus 18% GST", () => {
    expect(addOnPrice(addOnById("local-seo"), false)).toEqual({
      listCents: 1_000_000, discountCents: 0, netCents: 1_000_000, taxRateBasisPoints: 1_800, chargedCents: 1_180_000,
    });
    expect(addOnPrice(addOnById("press-release"), false).chargedCents).toBe(826_000);
  });

  it("takes 10% off for a Premium member, before tax", () => {
    expect(addOnPrice(addOnById("local-seo"), true)).toEqual({
      listCents: 1_000_000, discountCents: 100_000, netCents: 900_000, taxRateBasisPoints: 1_800, chargedCents: 1_062_000,
    });
    expect(addOnPrice(addOnById("performance-marketing"), true).chargedCents).toBe(849_600);
    expect(addOnPrice(addOnById("press-release"), true).chargedCents).toBe(743_400);
  });
});

describe("pressReleaseChargeDescription", () => {
  it("names the release, and says when the Premium member price was taken", () => {
    expect(pressReleaseChargeDescription(false)).toBe("Press release");
    expect(pressReleaseChargeDescription(true)).toBe("Press release, Premium member price");
  });
});
