import { describe, expect, it } from "vitest";
import { catalogueRows, packageLabel } from "./service-packages";

describe("packageLabel", () => {
  it("names the services in the catalogue's order, however they are given", () => {
    expect(packageLabel(["managed-website", "social-media"])).toBe("Website + Social");
    expect(packageLabel(["paid-ads", "managed-website"])).toBe("Website + Ads");
    expect(packageLabel(["paid-ads", "social-media", "managed-website"])).toBe("Website + Social + Ads");
  });

  it("names one service on its own", () => {
    expect(packageLabel(["social-media"])).toBe("Social");
  });
});

describe("catalogueRows", () => {
  it("lists each service on sale with its list price in rupees and dollars, from the catalogue", () => {
    expect(catalogueRows()).toEqual([
      { id: "managed-website", title: "Website Management", inr: "₹2,999", usd: "$59" },
      { id: "social-media", title: "Social Media Management", inr: "₹2,999", usd: "$59" },
      { id: "paid-ads", title: "Paid Ads Management", inr: "₹2,999", usd: "$59" },
      { id: "expert-monitoring", title: "Dedicated Expert Monitoring", inr: "₹6,000", usd: "$99" },
    ]);
  });
});
