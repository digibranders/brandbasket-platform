import { describe, expect, it } from "vitest";
import {
  bundleLines,
  bundleNetCents,
  nextBundledNetCents,
  reactivationBasketOf,
  reactivationNetCents,
  readBundleSelection,
  websiteAloneNetCents,
  type LapsedLine,
} from "./bundle";

describe("readBundleSelection", () => {
  it("keeps catalogue ids once each, in the catalogue's order", () => {
    expect(readBundleSelection(["local-seo-aeo", "digital-growth", "digital-growth", "managed-website"])).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
  });

  it("drops anything that is not a service", () => {
    expect(readBundleSelection(["press-release", "local-seo", "social-media", "", "local-seo-aeo"])).toEqual(["local-seo-aeo"]);
    expect(readBundleSelection([])).toEqual([]);
  });
});

describe("bundleLines", () => {
  it("prices a package at list once the business has given the offer up", () => {
    expect(bundleLines(["managed-website", "digital-growth"], "INR", true).map((line) => [line.offerCents, line.netCents])).toEqual([
      [0, 299_900],
      [0, 999_900],
    ]);
  });

  it("prices one service at its list price", () => {
    expect(bundleLines(["digital-growth"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 999_900, offerCents: 0, netCents: 999_900 },
    ]);
  });

  it("takes the package discount off each service, to the paisa", () => {
    expect(bundleLines(["digital-growth", "local-seo-aeo"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 999_900, offerCents: 299_970, netCents: 699_930 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 2_499_900, offerCents: 750_030, netCents: 1_749_870 },
    ]);
  });

  it("prices a dollar package in cents, in the catalogue's order", () => {
    expect(bundleLines(["local-seo-aeo", "managed-website"], "USD")).toEqual([
      { addOn: "managed-website", title: "Managed Website", listCents: 7_500, offerCents: 1_500, netCents: 6_000 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 35_000, offerCents: 7_000, netCents: 28_000 },
    ]);
  });

  it("adds the nets together, and is nothing for no services", () => {
    expect(bundleNetCents(bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], "INR"))).toBe(2_659_700);
    expect(bundleNetCents(bundleLines([], "INR"))).toBe(0);
  });
});

describe("nextBundledNetCents", () => {
  it("is the amount after a waiting removal, else the current one", () => {
    expect(nextBundledNetCents({ bundledAddOnNetCents: 759_810, pendingBundledAddOnNetCents: 569_905 })).toBe(569_905);
    expect(nextBundledNetCents({ bundledAddOnNetCents: 759_810, pendingBundledAddOnNetCents: null })).toBe(759_810);
    expect(nextBundledNetCents({ bundledAddOnNetCents: 189_905, pendingBundledAddOnNetCents: 0 })).toBe(0);
  });
});

describe("websiteAloneNetCents", () => {
  it("is the website's list price in each currency", () => {
    expect(websiteAloneNetCents("INR")).toBe(299_900);
    expect(websiteAloneNetCents("USD")).toBe(7_500);
  });
});

describe("reactivationBasketOf", () => {
  const PAID = new Date("2026-09-01T00:00:00Z");
  const LAPSED = { status: "active", activatedAt: PAID, cancelRequestedAt: null, adCreditCents: 500_000 } as const;
  const line = (addOn: string, overrides: Partial<LapsedLine> = {}): LapsedLine => ({ addOn, activatedAt: PAID, endRequestedAt: null, ...overrides });
  const ALL_THREE = [line("managed-website"), line("digital-growth"), line("local-seo-aeo")];

  it("restores a lapsed package's own services at the package price, with its ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: LAPSED, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 500_000,
      cancelled: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(2_659_700);
    expect(reactivationNetCents(basket, "USD")).toBe(35_000);
  });

  it("prices the set it restores, not the percentage the lapsed lines were last billed at", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 200_000 },
      lines: [line("managed-website"), line("digital-growth")],
      forfeited: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(1_039_800);
    expect(basket.adCreditCents).toBe(200_000);
  });

  it("restores a single service at its list price", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("local-seo-aeo")], forfeited: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_499_900);
  });

  it("restores a business that gave the offer up at list, with no ad credit", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("managed-website"), line("local-seo-aeo")], forfeited: true });
    expect(basket).toMatchObject({ services: ["managed-website", "local-seo-aeo"], forfeited: true, adCreditCents: 0, cancelled: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_799_800);
  });

  it("leaves out a service on its way out, one that was never paid for, and one that has stopped", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 0 },
      lines: [
        line("managed-website"),
        line("digital-growth", { endRequestedAt: new Date("2026-09-20T00:00:00Z") }),
        line("local-seo-aeo", { activatedAt: null }),
      ],
      forfeited: true,
    });
    expect(basket.services).toEqual(["managed-website"]);
  });

  it("takes the services the lapsed subscription billed, and its credit from the unpaid checkout that replaced it", () => {
    const basket = reactivationBasketOf({
      subscription: { status: "incomplete", activatedAt: null, cancelRequestedAt: null, adCreditCents: 500_000 },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 500_000,
      cancelled: false,
    });
  });

  it("does not take an unpaid checkout that was cancelled for a cancelled subscription", () => {
    const basket = reactivationBasketOf({
      subscription: { status: "cancelled", activatedAt: null, cancelRequestedAt: null, adCreditCents: 500_000 },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toMatchObject({ forfeited: false, adCreditCents: 500_000, cancelled: false });
    expect(basket.services).toHaveLength(3);
  });

  it("starts a subscription the customer asked to end at list with no ad credit, whatever it was stored with", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, cancelRequestedAt: new Date("2026-09-25T00:00:00Z") },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: true,
      adCreditCents: 0,
      cancelled: true,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(3_799_700);
  });

  it("restores a subscription the provider ended without the customer asking (a revoked mandate) as a lapse: package price and ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, status: "cancelled" }, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 500_000,
      cancelled: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(2_659_700);
  });

  it("falls back to the website alone, which earns no ad credit, when no service is left to restore", () => {
    expect(reactivationBasketOf({ subscription: LAPSED, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
    });
    expect(reactivationBasketOf({ subscription: null, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
    });
  });
});
