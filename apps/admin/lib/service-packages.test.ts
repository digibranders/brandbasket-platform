import { describe, expect, it } from "vitest";
import { catalogueRows, packageLabel, packageRows } from "./service-packages";

describe("packageLabel", () => {
  it("names the services in the catalogue's order, however they are given", () => {
    expect(packageLabel(["managed-website", "digital-growth"])).toBe("Website + Social");
    expect(packageLabel(["local-seo-aeo", "managed-website"])).toBe("Website + SEO");
    expect(packageLabel(["local-seo-aeo", "digital-growth", "managed-website"])).toBe("Website + Social + SEO");
  });

  it("names one service on its own", () => {
    expect(packageLabel(["digital-growth"])).toBe("Social");
  });
});

describe("catalogueRows", () => {
  it("lists each service with its list price in rupees and dollars, from the catalogue", () => {
    expect(catalogueRows()).toEqual([
      { id: "managed-website", title: "Managed Website", inr: "₹2,999", usd: "$65" },
      { id: "digital-growth", title: "Social Media and Ads", inr: "₹9,999", usd: "$150" },
      { id: "local-seo-aeo", title: "Local SEO + AEO", inr: "₹24,999", usd: "$350" },
    ]);
  });
});

describe("packageRows", () => {
  it("lists the four packages with the percentage off each service and the ad credit a month", () => {
    expect(packageRows()).toEqual([
      { services: "Managed Website + Social Media and Ads", offer: "10% off each service", adCredit: "₹1,500 or $25 a month" },
      { services: "Managed Website + Local SEO + AEO", offer: "10% off each service", adCredit: "None" },
      { services: "Social Media and Ads + Local SEO + AEO", offer: "10% off each service", adCredit: "₹1,500 or $25 a month" },
      { services: "Managed Website + Social Media and Ads + Local SEO + AEO", offer: "20% off each service", adCredit: "₹3,000 or $60 a month" },
    ]);
  });
});
