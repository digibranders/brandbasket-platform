import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, annualListCents, annualPriceCents, cyclePriceCents, isMonthlyAddOnId, monitoringIncludedWith, MONTHLY_ADD_ON_IDS, PLAN_ADD_ON_IDS, servicesToList } from "./add-ons";

describe("services catalogue", () => {
  it("describes the website as up to 10 pages", () => {
    expect(addOnById("managed-website").line).toContain("website of up to 10 pages");
  });

  it("sells Website, Social Media and Paid Ads Management and monitoring, monthly, in the order the website lists them", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.title, addOn.billing])).toEqual([
      ["managed-website", "Website Management", "monthly"],
      ["social-media", "Social Media Management", "monthly"],
      ["paid-ads", "Paid Ads Management", "monthly"],
      ["expert-monitoring", "Dedicated Expert Monitoring", "monthly"],
    ]);
    expect(MONTHLY_ADD_ON_IDS).toEqual(["managed-website", "social-media", "paid-ads", "expert-monitoring"]);
    expect(PLAN_ADD_ON_IDS).toEqual(["managed-website", "social-media", "paid-ads"]);
    expect(isMonthlyAddOnId("paid-ads")).toBe(true);
    // The plans retired on 2026-11-06 are not services any more.
    expect(isMonthlyAddOnId("digital-growth")).toBe(false);
    expect(isMonthlyAddOnId("local-seo-aeo")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  // brandbasket-website lib/pricing.ts: 2,999 rupees and 59 dollars for each plan; monitoring 6,000 or 99.
  it("lists in minor units what the website lists, GST included in rupees", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.prices.INR, addOn.prices.USD])).toEqual([
      ["managed-website", 299_900, 5_900],
      ["social-media", 299_900, 5_900],
      ["paid-ads", 299_900, 5_900],
      ["expert-monitoring", 600_000, 9_900],
    ]);
  });

  it("includes monitoring with all three plans only", () => {
    expect(monitoringIncludedWith(["managed-website", "social-media", "paid-ads"])).toBe(true);
    expect(monitoringIncludedWith(["managed-website", "social-media", "expert-monitoring"])).toBe(false);
    expect(monitoringIncludedWith(["social-media", "paid-ads"])).toBe(false);
  });

  it("lists every service on a services page, except monitoring beside all three plans unless it is still billed", () => {
    expect(servicesToList(["managed-website"], ["managed-website"])).toEqual(MONTHLY_ADD_ON_IDS);
    const allThree = ["managed-website", "social-media", "paid-ads"] as const;
    expect(servicesToList(allThree, allThree)).toEqual(allThree);
    // A monitoring line ending at the next billing date, once the third plan joined, stays on the page until then.
    expect(servicesToList([...allThree, "expert-monitoring"], allThree)).toEqual(MONTHLY_ADD_ON_IDS);
  });

  it("says what Paid Ads Management does and the budget it manages", () => {
    expect(addOnById("paid-ads").line).toContain("Meta ads with AI creatives");
    expect(addOnById("paid-ads").line).toContain("up to ₹10,000 a month of your budget");
  });

  it("charges the website at 2,999 rupees a month, the 18% GST already inside it", () => {
    expect(addOnPrice(addOnById("managed-website"), "INR")).toEqual({
      currency: "INR", listCents: 299_900, discountCents: 0, offerCents: 0, netCents: 299_900, taxRateBasisPoints: 1_800, chargedCents: 299_900,
    });
    expect(addOnPrice(addOnById("paid-ads"), "INR").chargedCents).toBe(299_900);
  });

  it("prices in dollars with no tax", () => {
    expect(addOnPrice(addOnById("social-media"), "USD")).toMatchObject({ listCents: 5_900, taxRateBasisPoints: 0, chargedCents: 5_900 });
    expect(addOnPrice(addOnById("expert-monitoring"), "USD")).toMatchObject({ listCents: 9_900, taxRateBasisPoints: 0, chargedCents: 9_900 });
  });

  it("takes the package discount it is given off the list price the customer pays", () => {
    expect(addOnPrice(addOnById("social-media"), "INR", 29_970)).toEqual({
      currency: "INR", listCents: 299_900, discountCents: 29_970, offerCents: 29_970, netCents: 269_930, taxRateBasisPoints: 1_800, chargedCents: 269_930,
    });
  });

  it("refuses a discount that is not whole minor units between nothing and the list price", () => {
    const website = addOnById("managed-website");
    expect(() => addOnPrice(website, "INR", -1)).toThrow(RangeError);
    expect(() => addOnPrice(website, "INR", 299_901)).toThrow(RangeError);
    expect(() => addOnPrice(website, "INR", 0.5)).toThrow(RangeError);
  });

  it("says that ad spend is paid to Meta on top of Paid Ads Management, and nothing extra for the others", () => {
    expect(addOnById("paid-ads").extra).toBe("+ your ad spend");
    expect(addOnById("social-media").extra).toBeUndefined();
    expect(addOnById("managed-website").extra).toBeUndefined();
    expect(addOnById("expert-monitoring").extra).toBeUndefined();
  });
});

describe("annual prices", () => {
  it("takes 10% off twelve months and rounds down to a whole rupee or dollar", () => {
    expect(annualPriceCents(299_900)).toBe(3_238_900);
    expect(annualPriceCents(600_000)).toBe(6_480_000);
    expect(annualPriceCents(5_900)).toBe(63_700);
    expect(annualPriceCents(9_900)).toBe(106_900);
    expect(annualListCents(299_900)).toBe(3_598_800);
  });

  it("prices a line for a year on a yearly subscription, the annual discount inside the list price", () => {
    const website = addOnById("managed-website");
    expect(cyclePriceCents(website, "INR", "month")).toBe(299_900);
    expect(addOnPrice(website, "INR", 0, "year")).toMatchObject({ listCents: 3_238_900, discountCents: 0, netCents: 3_238_900, chargedCents: 3_238_900 });
  });
});
