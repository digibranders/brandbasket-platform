import { describe, expect, it } from "vitest";
import { catalogueRows, packageLabel, packageRows } from "./service-packages";

describe("packageLabel", () => {
  it("names the services in the catalogue's order, however they are given", () => {
    expect(packageLabel(["managed-website", "social-media"])).toBe("Website + Social");
    expect(packageLabel(["paid-ads", "managed-website"])).toBe("Website + Ads");
    expect(packageLabel(["paid-ads", "social-media", "managed-website"])).toBe("Website + Social + Ads");
  });

  it("names one service on its own", () => {
    expect(packageLabel(["social-media"])).toBe("Social");
  });

  it("names the plans no longer sold, which older clients still have", () => {
    expect(packageLabel(["digital-growth", "managed-website"])).toBe("Website + Social & Ads");
    expect(packageLabel(["local-seo-aeo"])).toBe("SEO");
  });
});

describe("catalogueRows", () => {
  it("lists each service on sale with its list price in rupees and dollars, from the catalogue", () => {
    expect(catalogueRows()).toEqual([
      { id: "managed-website", title: "Website Management", inr: "₹2,999", usd: "$65" },
      { id: "social-media", title: "Social Media Management", inr: "₹9,999", usd: "$150" },
      { id: "paid-ads", title: "Paid Ads Management", inr: "₹24,999", usd: "$350" },
      { id: "expert-monitoring", title: "Dedicated Expert Monitoring", inr: "₹6,000", usd: "$75" },
    ]);
  });
});

describe("packageRows", () => {
  it("lists the four packages with the percentage off each service and the ad credit a month", () => {
    expect(packageRows()).toEqual([
      { services: "Website Management + Social Media Management", offer: "10% off each service", adCredit: "₹1,500 or $30 a month" },
      { services: "Website Management + Paid Ads Management", offer: "10% off each service", adCredit: "None" },
      { services: "Social Media Management + Paid Ads Management", offer: "10% off each service", adCredit: "₹1,500 or $30 a month" },
      { services: "Website Management + Social Media Management + Paid Ads Management", offer: "20% off each service", adCredit: "₹3,000 or $60 a month" },
    ]);
  });
});
