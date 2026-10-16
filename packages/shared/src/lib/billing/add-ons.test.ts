import { describe, expect, it } from "vitest";
import { ADD_ONS, addOnById, addOnPrice, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS } from "./add-ons";

describe("add-on catalogue", () => {
  it("sells three monthly services, in the order the website lists them", () => {
    expect(ADD_ONS.map((addOn) => [addOn.id, addOn.title, addOn.billing])).toEqual([
      ["social-media", "Social media", "monthly"],
      ["lead-generation", "Outreach and lead generation", "monthly"],
      ["advertising", "Paid advertising", "monthly"],
    ]);
    expect(MONTHLY_ADD_ON_IDS).toEqual(["social-media", "lead-generation", "advertising"]);
    expect(isMonthlyAddOnId("press-release")).toBe(false);
    expect(isMonthlyAddOnId("constructor")).toBe(false);
  });

  it("prices at 1,999, 4,999 and 5,999 rupees a month plus 18% GST", () => {
    expect(addOnById("social-media").prices.INR).toBe(199_900);
    expect(addOnById("lead-generation").prices.INR).toBe(499_900);
    expect(addOnById("advertising").prices.INR).toBe(599_900);
    expect(addOnPrice(addOnById("social-media"), "INR", false)).toEqual({
      currency: "INR", listCents: 199_900, discountCents: 0, offerCents: 0, netCents: 199_900, taxRateBasisPoints: 1_800, chargedCents: 235_882,
    });
    expect(addOnPrice(addOnById("lead-generation"), "INR", false).chargedCents).toBe(589_882);
    expect(addOnPrice(addOnById("advertising"), "INR", false).chargedCents).toBe(707_882);
  });

  it("prices at 100, 125 and 125 dollars a month with no tax", () => {
    expect(addOnPrice(addOnById("social-media"), "USD", false)).toEqual({
      currency: "USD", listCents: 10_000, discountCents: 0, offerCents: 0, netCents: 10_000, taxRateBasisPoints: 0, chargedCents: 10_000,
    });
    expect(addOnPrice(addOnById("lead-generation"), "USD", false).chargedCents).toBe(12_500);
    expect(addOnPrice(addOnById("advertising"), "USD", false).chargedCents).toBe(12_500);
    expect(addOnPrice(addOnById("social-media"), "USD", false, true)).toMatchObject({ offerCents: 500, netCents: 9_500, chargedCents: 9_500 });
  });

  it("takes 10% off for a Premium member, before tax", () => {
    expect(addOnPrice(addOnById("social-media"), "INR", true)).toMatchObject({ discountCents: 19_990, offerCents: 0, netCents: 179_910 });
  });

  it("takes the 5% lifetime offer off the list price, before tax: 99.95, 249.95 and 299.95 rupees", () => {
    expect(addOnPrice(addOnById("social-media"), "INR", false, true)).toEqual({
      currency: "INR", listCents: 199_900, discountCents: 9_995, offerCents: 9_995, netCents: 189_905, taxRateBasisPoints: 1_800, chargedCents: 224_088,
    });
    expect(addOnPrice(addOnById("lead-generation"), "INR", false, true)).toMatchObject({ offerCents: 24_995, netCents: 474_905 });
    expect(addOnPrice(addOnById("advertising"), "INR", false, true)).toMatchObject({ offerCents: 29_995, netCents: 569_905 });
    expect(addOnPrice(addOnById("advertising"), "INR", true, true)).toMatchObject({ discountCents: 89_985, offerCents: 29_995, netCents: 509_915 });
  });
});
