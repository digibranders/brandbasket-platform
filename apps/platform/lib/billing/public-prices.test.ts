import { ADD_ONS } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import { describe, expect, it } from "vitest";
import { publicPricing } from "./public-prices";

describe("publicPricing", () => {
  const pricing = publicPricing();

  it("lists every service with its list price in each currency, in minor units", () => {
    expect(pricing.services).toEqual([
      { id: "managed-website", title: "Website Management", prices: { INR: 299_900, USD: 5_900 } },
      { id: "social-media", title: "Social Media Management", prices: { INR: 299_900, USD: 5_900 } },
      { id: "paid-ads", title: "Paid Ads Management", prices: { INR: 299_900, USD: 5_900 } },
      { id: "expert-monitoring", title: "Dedicated Expert Monitoring", prices: { INR: 600_000, USD: 9_900 } },
    ]);
  });

  it("lists no packages, as none is on sale", () => {
    expect(pricing.packages).toEqual([]);
  });

  it("is the catalogue and the package offers, not a copy of them", () => {
    expect(pricing.services.map((service) => service.id)).toEqual(ADD_ONS.map((addOn) => addOn.id));
    expect(pricing.packages).toHaveLength(PACKAGE_OFFERS.length);
  });

  it("carries nothing about the plan rows or the provider", () => {
    expect(Object.keys(pricing).sort()).toEqual(["packages", "services"]);
  });
});
