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

  it("prices at 1,999, 3,999 and 5,999 rupees a month plus 18% GST", () => {
    expect(addOnById("social-media").paise).toBe(199_900);
    expect(addOnById("lead-generation").paise).toBe(399_900);
    expect(addOnById("advertising").paise).toBe(599_900);
    expect(addOnPrice(addOnById("social-media"), false)).toEqual({
      listCents: 199_900, discountCents: 0, offerCents: 0, netCents: 199_900, taxRateBasisPoints: 1_800, chargedCents: 235_882,
    });
    expect(addOnPrice(addOnById("lead-generation"), false).chargedCents).toBe(471_882);
    expect(addOnPrice(addOnById("advertising"), false).chargedCents).toBe(707_882);
  });

  it("takes 10% off for a Premium member, before tax", () => {
    expect(addOnPrice(addOnById("social-media"), true)).toMatchObject({ discountCents: 19_990, offerCents: 0, netCents: 179_910 });
  });

  it("takes the 5% lifetime offer off the list price, before tax: 99.95, 199.95 and 299.95 rupees", () => {
    expect(addOnPrice(addOnById("social-media"), false, true)).toEqual({
      listCents: 199_900, discountCents: 9_995, offerCents: 9_995, netCents: 189_905, taxRateBasisPoints: 1_800, chargedCents: 224_088,
    });
    expect(addOnPrice(addOnById("lead-generation"), false, true)).toMatchObject({ offerCents: 19_995, netCents: 379_905 });
    expect(addOnPrice(addOnById("advertising"), false, true)).toMatchObject({ offerCents: 29_995, netCents: 569_905 });
    expect(addOnPrice(addOnById("advertising"), true, true)).toMatchObject({ discountCents: 89_985, offerCents: 29_995, netCents: 509_915 });
  });
});
