import { ADD_ONS } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS } from "@brandbasket/shared/lib/billing/packages";
import { describe, expect, it } from "vitest";
import { publicPricing } from "./public-prices";

describe("publicPricing", () => {
  const pricing = publicPricing();

  it("lists every service with its list price in each currency, in minor units", () => {
    expect(pricing.services).toEqual([
      { id: "managed-website", title: "Managed Website", prices: { INR: 299_900, USD: 7_500 } },
      { id: "digital-growth", title: "Social Media and Ads", prices: { INR: 999_900, USD: 7_500 } },
      { id: "local-seo-aeo", title: "Local SEO + AEO", prices: { INR: 2_499_900, USD: 35_000 } },
    ]);
  });

  it("lists the four packages with their percentage and ad credit", () => {
    expect(pricing.packages).toEqual([
      { services: ["managed-website", "digital-growth"], basisPoints: 2_000, adCreditCents: { INR: 200_000, USD: 2_500 } },
      { services: ["managed-website", "local-seo-aeo"], basisPoints: 2_000, adCreditCents: { INR: 0, USD: 0 } },
      { services: ["digital-growth", "local-seo-aeo"], basisPoints: 3_000, adCreditCents: { INR: 200_000, USD: 2_500 } },
      { services: ["managed-website", "digital-growth", "local-seo-aeo"], basisPoints: 3_000, adCreditCents: { INR: 500_000, USD: 6_000 } },
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
