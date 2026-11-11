import { ADD_ONS } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import { describe, expect, it } from "vitest";
import { publicPricing } from "./public-prices";

describe("publicPricing", () => {
  const pricing = publicPricing();

  it("lists every service with its list price in each currency, in minor units", () => {
    expect(pricing.services).toEqual([
      { id: "managed-website", title: "Website Management", prices: { INR: 299_900, USD: 6_500 } },
      { id: "social-media", title: "Social Media Management", prices: { INR: 999_900, USD: 15_000 } },
      { id: "paid-ads", title: "Paid Ads Management", prices: { INR: 2_499_900, USD: 35_000 } },
      { id: "expert-monitoring", title: "Dedicated Expert Monitoring", prices: { INR: 600_000, USD: 7_500 } },
    ]);
  });

  it("lists the four packages with their percentage and ad credit", () => {
    expect(pricing.packages).toEqual([
      { services: ["managed-website", "social-media"], basisPoints: 1_000, adCreditCents: { INR: 150_000, USD: 3_000 } },
      { services: ["managed-website", "paid-ads"], basisPoints: 1_000, adCreditCents: { INR: 0, USD: 0 } },
      { services: ["social-media", "paid-ads"], basisPoints: 1_000, adCreditCents: { INR: 150_000, USD: 3_000 } },
      { services: ["managed-website", "social-media", "paid-ads"], basisPoints: 2_000, adCreditCents: { INR: 300_000, USD: 6_000 } },
    ]);
  });

  it("is the catalogue and the package offers, not a copy of them", () => {
    expect(pricing.services.map((service) => service.id)).toEqual(ADD_ONS.map((addOn) => addOn.id));
    expect(pricing.packages).toHaveLength(PACKAGE_OFFERS.length);
  });

  it("carries nothing about the plan rows or the provider", () => {
    expect(Object.keys(pricing).sort()).toEqual(["packages", "services"]);
  });
});
