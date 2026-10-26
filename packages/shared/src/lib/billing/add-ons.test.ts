import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS } from "./add-ons";

describe("services catalogue", () => {
  it("sells Managed Website, Social Media and Ads and Local SEO + AEO, monthly, in the order the website lists them", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.title, addOn.billing])).toEqual([
      ["managed-website", "Managed Website", "monthly"],
      ["digital-growth", "Social Media and Ads", "monthly"],
      ["local-seo-aeo", "Local SEO + AEO", "monthly"],
    ]);
    expect(MONTHLY_ADD_ON_IDS).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
    expect(isMonthlyAddOnId("managed-website")).toBe(true);
    expect(isMonthlyAddOnId("social-media")).toBe(false);
    expect(isMonthlyAddOnId("local-seo")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  it("lists in minor units: 2,999, 9,999 and 24,999 rupees (GST included), 65, 150 and 350 dollars", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.prices.INR, addOn.prices.USD])).toEqual([
      ["managed-website", 299_900, 6_500],
      ["digital-growth", 999_900, 15_000],
      ["local-seo-aeo", 2_499_900, 35_000],
    ]);
  });

  it("says what Social Media and Ads does: posts planned with the client, review replies and Meta ads, with no fixed post counts", () => {
    const { line } = addOnById("digital-growth");
    expect(line).toContain("Instagram, Facebook and Google profile posts planned with you each month");
    expect(line).toContain("review replies");
    expect(line).toContain("Meta ads managed for up to ₹10,000 a month of your budget");
    expect(line).not.toMatch(/\d+ (designed )?posts/);
  });

  it("charges the website at 2,999 rupees a month, the 18% GST already inside it", () => {
    expect(addOnPrice(addOnById("managed-website"), "INR")).toEqual({
      currency: "INR", listCents: 299_900, discountCents: 0, offerCents: 0, netCents: 299_900, taxRateBasisPoints: 1_800, chargedCents: 299_900,
    });
    expect(addOnPrice(addOnById("local-seo-aeo"), "INR").chargedCents).toBe(2_499_900);
  });

  it("prices in dollars with no tax", () => {
    expect(addOnPrice(addOnById("digital-growth"), "USD")).toMatchObject({ listCents: 15_000, taxRateBasisPoints: 0, chargedCents: 15_000 });
    expect(addOnPrice(addOnById("local-seo-aeo"), "USD")).toMatchObject({ listCents: 35_000, taxRateBasisPoints: 0, chargedCents: 35_000 });
  });

  it("takes the package discount it is given off the list price the customer pays", () => {
    expect(addOnPrice(addOnById("digital-growth"), "INR", 299_970)).toEqual({
      currency: "INR", listCents: 999_900, discountCents: 299_970, offerCents: 299_970, netCents: 699_930, taxRateBasisPoints: 1_800, chargedCents: 699_930,
    });
  });

  it("refuses a discount that is not whole minor units between nothing and the list price", () => {
    const website = addOnById("managed-website");
    expect(() => addOnPrice(website, "INR", -1)).toThrow(RangeError);
    expect(() => addOnPrice(website, "INR", 299_901)).toThrow(RangeError);
    expect(() => addOnPrice(website, "INR", 0.5)).toThrow(RangeError);
  });

  it("says that ad spend is paid to Meta on top of Social Media and Ads, and nothing extra for the others", () => {
    expect(addOnById("digital-growth").extra).toBe("+ your ad spend");
    expect(addOnById("managed-website").extra).toBeUndefined();
    expect(addOnById("local-seo-aeo").extra).toBeUndefined();
  });
});
