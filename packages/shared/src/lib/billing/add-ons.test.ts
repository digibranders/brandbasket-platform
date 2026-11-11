import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, isMonthlyAddOnId, isSoldAddOnId, monitoringIncludedWith, PLAN_ADD_ON_IDS, SOLD_ADD_ON_IDS } from "./add-ons";

describe("services catalogue", () => {
  it("describes the Managed Website as up to 10 pages and the Local SEO plan as up to 5 pages optimised a month", () => {
    expect(addOnById("managed-website").line).toContain("website of up to 10 pages");
    expect(addOnById("local-seo-aeo").line).toContain("up to 5 pages optimised a month");
  });

  it("sells Website, Social Media and Paid Ads Management and monitoring, monthly, in the order the website lists them, and keeps the old plans unsold", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.title, addOn.billing, addOn.sold])).toEqual([
      ["managed-website", "Website Management", "monthly", true],
      ["social-media", "Social Media Management", "monthly", true],
      ["paid-ads", "Paid Ads Management", "monthly", true],
      ["expert-monitoring", "Dedicated Expert Monitoring", "monthly", true],
      ["digital-growth", "Social Media and Ads", "monthly", false],
      ["local-seo-aeo", "Local SEO + AEO", "monthly", false],
    ]);
    expect(SOLD_ADD_ON_IDS).toEqual(["managed-website", "social-media", "paid-ads", "expert-monitoring"]);
    expect(PLAN_ADD_ON_IDS).toEqual(["managed-website", "social-media", "paid-ads"]);
    expect(isMonthlyAddOnId("managed-website")).toBe(true);
    expect(isMonthlyAddOnId("digital-growth")).toBe(true);
    expect(isSoldAddOnId("digital-growth")).toBe(false);
    expect(isSoldAddOnId("paid-ads")).toBe(true);
    expect(isMonthlyAddOnId("local-seo")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  // brandbasket-website lib/pricing.ts: 2,999, 9,999 and 24,999 rupees, 65, 150 and 350 dollars; monitoring 6,000 or 75.
  it("lists in minor units what the website lists, GST included in rupees", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.prices.INR, addOn.prices.USD])).toEqual([
      ["managed-website", 299_900, 6_500],
      ["social-media", 999_900, 15_000],
      ["paid-ads", 2_499_900, 35_000],
      ["expert-monitoring", 600_000, 7_500],
      ["digital-growth", 999_900, 15_000],
      ["local-seo-aeo", 2_499_900, 35_000],
    ]);
  });

  it("counts each old plan in the slot of the plan that replaced it, and monitoring in no package", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.packageSlot])).toEqual([
      ["managed-website", "managed-website"],
      ["social-media", "social-media"],
      ["paid-ads", "paid-ads"],
      ["expert-monitoring", null],
      ["digital-growth", "social-media"],
      ["local-seo-aeo", "paid-ads"],
    ]);
  });

  it("includes monitoring with all three plans only, an old plan counting in its slot", () => {
    expect(monitoringIncludedWith(["managed-website", "social-media", "paid-ads"])).toBe(true);
    expect(monitoringIncludedWith(["managed-website", "digital-growth", "paid-ads"])).toBe(true);
    expect(monitoringIncludedWith(["managed-website", "social-media", "expert-monitoring"])).toBe(false);
    expect(monitoringIncludedWith(["social-media", "paid-ads"])).toBe(false);
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

  it("says that ad spend is paid to Meta on top of Paid Ads Management and Social Media and Ads, and nothing extra for the others", () => {
    expect(addOnById("paid-ads").extra).toBe("+ your ad spend");
    expect(addOnById("social-media").extra).toBeUndefined();
    expect(addOnById("digital-growth").extra).toBe("+ your ad spend");
    expect(addOnById("managed-website").extra).toBeUndefined();
    expect(addOnById("local-seo-aeo").extra).toBeUndefined();
  });
});
