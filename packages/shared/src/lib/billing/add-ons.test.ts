import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS } from "./add-ons";

describe("add-on catalogue", () => {
  it("sells Digital Growth and Local SEO + AEO, monthly, in the order the website lists them", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.title, addOn.billing])).toEqual([
      ["digital-growth", "Digital Growth", "monthly"],
      ["local-seo-aeo", "Local SEO + AEO", "monthly"],
    ]);
    expect(MONTHLY_ADD_ON_IDS).toEqual(["digital-growth", "local-seo-aeo"]);
    expect(isMonthlyAddOnId("social-media")).toBe(false);
    expect(isMonthlyAddOnId("local-seo")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  it("prices at 7,000 and 25,000 rupees a month plus 18% GST", () => {
    expect(addOnById("digital-growth").prices.INR).toBe(700_000);
    expect(addOnById("local-seo-aeo").prices.INR).toBe(2_500_000);
    expect(addOnPrice(addOnById("digital-growth"), "INR")).toEqual({
      currency: "INR", listCents: 700_000, discountCents: 0, offerCents: 0, netCents: 700_000, taxRateBasisPoints: 1_800, chargedCents: 826_000,
    });
    expect(addOnPrice(addOnById("local-seo-aeo"), "INR").chargedCents).toBe(2_950_000);
  });

  it("prices at 75 and 350 dollars a month with no tax", () => {
    expect(addOnPrice(addOnById("digital-growth"), "USD")).toMatchObject({ listCents: 7_500, taxRateBasisPoints: 0, chargedCents: 7_500 });
    expect(addOnPrice(addOnById("local-seo-aeo"), "USD")).toMatchObject({ listCents: 35_000, taxRateBasisPoints: 0, chargedCents: 35_000 });
  });

  it("takes the 5% sign-up offer off the list price, before tax: 6,650 and 23,750 rupees, 71.25 and 332.50 dollars", () => {
    expect(addOnPrice(addOnById("digital-growth"), "INR", true)).toEqual({
      currency: "INR", listCents: 700_000, discountCents: 35_000, offerCents: 35_000, netCents: 665_000, taxRateBasisPoints: 1_800, chargedCents: 784_700,
    });
    expect(addOnPrice(addOnById("local-seo-aeo"), "INR", true).netCents).toBe(2_375_000);
    expect(addOnPrice(addOnById("digital-growth"), "USD", true).netCents).toBe(7_125);
    expect(addOnPrice(addOnById("local-seo-aeo"), "USD", true).netCents).toBe(33_250);
  });

  it("says that ad spend is paid to Meta on top of Digital Growth, and nothing extra for Local SEO + AEO", () => {
    expect(addOnById("digital-growth").extra).toBe("+ your ad spend");
    expect(addOnById("local-seo-aeo").extra).toBeUndefined();
  });
});
