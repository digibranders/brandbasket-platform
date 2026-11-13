// @vitest-environment node
import { ADD_ONS } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import { describe, expect, it } from "vitest";
import { publicPricing } from "./public-prices";

describe("publicPricing", () => {
  const pricing = publicPricing();

  it("lists every service with its monthly and yearly prices in each currency, in minor units", () => {
    const plan = { INR: 299_900, USD: 5_900 };
    const planYear = { annualPrices: { INR: 3_238_900, USD: 63_700 }, annualListPrices: { INR: 3_598_800, USD: 70_800 } };
    expect(pricing.services).toEqual([
      { id: "managed-website", title: "Website Management", prices: plan, ...planYear },
      { id: "social-media", title: "Social Media Management", prices: plan, ...planYear },
      { id: "paid-ads", title: "Paid Ads Management", prices: plan, ...planYear },
      {
        id: "expert-monitoring",
        title: "Dedicated Expert Monitoring",
        prices: { INR: 600_000, USD: 9_900 },
        annualPrices: { INR: 6_480_000, USD: 106_900 },
        annualListPrices: { INR: 7_200_000, USD: 118_800 },
      },
    ]);
  });

  it("says what paying yearly takes off: 10%", () => {
    expect(pricing.annualDiscountBasisPoints).toBe(1_000);
  });

  it("lists no packages, as none is on sale", () => {
    expect(pricing.packages).toEqual([]);
  });

  it("is the catalogue and the package offers, not a copy of them", () => {
    expect(pricing.services.map((service) => service.id)).toEqual(ADD_ONS.map((addOn) => addOn.id));
    expect(pricing.packages).toHaveLength(PACKAGE_OFFERS.length);
  });

  it("carries nothing about the plan rows or the provider", () => {
    expect(Object.keys(pricing).sort()).toEqual(["annualDiscountBasisPoints", "packages", "services"]);
  });
});
