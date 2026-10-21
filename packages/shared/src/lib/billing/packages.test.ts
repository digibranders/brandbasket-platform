import { describe, expect, it } from "vitest";
import { adCreditCentsAtCheckout, adCreditCentsFor, packageBasisPointsFor, packageDiscountCentsFor, packageLines, packageLineWith } from "./packages";

describe("package offers", () => {
  it.each([
    [["managed-website"], 0],
    [["digital-growth"], 0],
    [["managed-website", "digital-growth"], 2000],
    [["managed-website", "local-seo-aeo"], 2000],
    [["digital-growth", "local-seo-aeo"], 3000],
    [["managed-website", "digital-growth", "local-seo-aeo"], 3000],
  ] as const)("gives %o %i basis points off", (services, bp) => {
    expect(packageBasisPointsFor({ services, forfeited: false })).toBe(bp);
    expect(packageBasisPointsFor({ services, forfeited: true })).toBe(0);
  });

  it("does not care about order or duplicates", () => {
    expect(packageBasisPointsFor({ services: ["local-seo-aeo", "managed-website", "local-seo-aeo"], forfeited: false })).toBe(2000);
  });

  it.each([
    [["managed-website", "digital-growth"], "INR", 1040000],
    [["managed-website", "local-seo-aeo"], "INR", 2240000],
    [["digital-growth", "local-seo-aeo"], "INR", 2450000],
    [["managed-website", "digital-growth", "local-seo-aeo"], "INR", 2660000],
    [["managed-website", "digital-growth", "local-seo-aeo"], "USD", 35000],
    [["digital-growth", "local-seo-aeo"], "USD", 29750],
  ] as const)("prices %o in %s at %i net", (services, currency, net) => {
    const lines = packageLines({ services, forfeited: false }, currency);
    expect(lines.reduce((sum, line) => sum + line.netCents, 0)).toBe(net);
    for (const line of lines) expect(line.netCents).toBe(line.listCents - line.discountCents);
  });

  it("rounds a line's discount half up", () => {
    expect(packageDiscountCentsFor(333, 3000)).toBe(100);
    expect(packageDiscountCentsFor(335, 3000)).toBe(101);
  });

  it.each([
    [["managed-website"], "INR", 0],
    [["managed-website", "digital-growth"], "INR", 200000],
    [["managed-website", "local-seo-aeo"], "INR", 0],
    [["digital-growth", "local-seo-aeo"], "INR", 200000],
    [["managed-website", "digital-growth", "local-seo-aeo"], "INR", 500000],
    [["managed-website", "digital-growth"], "USD", 2500],
    [["digital-growth", "local-seo-aeo"], "USD", 2500],
    [["managed-website", "digital-growth", "local-seo-aeo"], "USD", 6000],
    [["managed-website", "local-seo-aeo"], "USD", 0],
  ] as const)("earns %o bought together ad credit in %s of %i a month", (services, currency, cents) => {
    expect(adCreditCentsFor(services, currency)).toBe(cents);
  });

  it("earns ad credit at checkout only for a business that has never paid and has not given the offer up", () => {
    const services = ["managed-website", "digital-growth", "local-seo-aeo"] as const;
    expect(adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: false }, "INR")).toBe(500000);
    expect(adCreditCentsAtCheckout({ services, forfeited: true, hasEverPaid: false }, "INR")).toBe(0);
    expect(adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: true }, "INR")).toBe(0);
  });

  it("prices a service joining a basket at the percentage the enlarged set earns, and at list once the offer is given up", () => {
    expect(packageLineWith({ services: ["managed-website"], forfeited: false }, "digital-growth", "INR")).toMatchObject({ addOn: "digital-growth", discountCents: 200000, netCents: 800000 });
    expect(packageLineWith({ services: ["managed-website", "digital-growth"], forfeited: false }, "local-seo-aeo", "USD")).toMatchObject({ discountCents: 10500, netCents: 24500 });
    expect(packageLineWith({ services: ["managed-website"], forfeited: true }, "digital-growth", "INR")).toMatchObject({ discountCents: 0, netCents: 1000000 });
    expect(packageLineWith({ services: [], forfeited: false }, "managed-website", "INR")).toMatchObject({ discountCents: 0, netCents: 300000 });
  });
});
