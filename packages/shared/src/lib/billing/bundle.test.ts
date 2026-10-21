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
      [0, 300_000],
      [0, 1_000_000],
    ]);
  });

  it("prices one service at its list price", () => {
    expect(bundleLines(["digital-growth"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 1_000_000, offerCents: 0, netCents: 1_000_000 },
    ]);
  });

  it("takes the package discount off each service, to the paisa", () => {
    expect(bundleLines(["digital-growth", "local-seo-aeo"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 1_000_000, offerCents: 300_000, netCents: 700_000 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 2_500_000, offerCents: 750_000, netCents: 1_750_000 },
    ]);
  });

  it("prices a dollar package in cents, in the catalogue's order", () => {
    expect(bundleLines(["local-seo-aeo", "managed-website"], "USD")).toEqual([
      { addOn: "managed-website", title: "Managed Website", listCents: 7_500, offerCents: 1_500, netCents: 6_000 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 35_000, offerCents: 7_000, netCents: 28_000 },
    ]);
  });

  it("adds the nets together, and is nothing for no services", () => {
    expect(bundleNetCents(bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], "INR"))).toBe(2_660_000);
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
    expect(websiteAloneNetCents("INR")).toBe(300_000);
    expect(websiteAloneNetCents("USD")).toBe(7_500);
  });
});

describe("reactivationBasketOf", () => {
  const LAPSED = { status: "active", activatedAt: new Date("2026-09-01T00:00:00Z"), cancelRequestedAt: null, adCreditCents: 500_000 } as const;
  const line = (addOn: string, overrides: Partial<LapsedLine> = {}): LapsedLine => ({ addOn, status: "active", endRequestedAt: null, ...overrides });
  const ALL_THREE = [line("managed-website"), line("digital-growth"), line("local-seo-aeo")];

  it("restores a lapsed package's own services at the package price, with its ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: LAPSED, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 500_000,
      cancelled: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(2_660_000);
    expect(reactivationNetCents(basket, "USD")).toBe(35_000);
  });

  it("prices the set it restores, not the percentage the lapsed lines were last billed at", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 200_000 },
      lines: [line("managed-website"), line("digital-growth")],
      forfeited: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(1_040_000);
    expect(basket.adCreditCents).toBe(200_000);
  });

  it("restores a single service at its list price", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("local-seo-aeo")], forfeited: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_500_000);
  });

  it("restores a business that gave the offer up at list, with no ad credit", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("managed-website"), line("local-seo-aeo")], forfeited: true });
    expect(basket).toMatchObject({ services: ["managed-website", "local-seo-aeo"], forfeited: true, adCreditCents: 0, cancelled: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_800_000);
  });

  it("leaves out a service on its way out, one still waiting for its payment, and one that has stopped", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 0 },
      lines: [
        line("managed-website"),
        line("digital-growth", { endRequestedAt: new Date("2026-09-20T00:00:00Z") }),
        line("local-seo-aeo", { status: "pending" }),
        line("managed-website", { status: "removed" }),
      ],
      forfeited: true,
    });
    expect(basket.services).toEqual(["managed-website"]);
  });

  it("takes every service of a reactivation checkout that was left unpaid, whose lines are all still pending", () => {
    const basket = reactivationBasketOf({
      subscription: { status: "incomplete", activatedAt: null, cancelRequestedAt: null, adCreditCents: 500_000 },
      lines: ALL_THREE.map((row) => ({ ...row, status: "pending" as const })),
      forfeited: false,
    });
    expect(basket).toMatchObject({ services: ["managed-website", "digital-growth", "local-seo-aeo"], adCreditCents: 500_000 });
  });

  it.each([
    ["ended at the provider", { ...LAPSED, status: "cancelled" }],
    ["asked to end with its period", { ...LAPSED, cancelRequestedAt: new Date("2026-09-25T00:00:00Z") }],
  ] as const)("starts a subscription %s at list with no ad credit, whatever it was stored with", (_label, subscription) => {
    const basket = reactivationBasketOf({ subscription, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: true,
      adCreditCents: 0,
      cancelled: true,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(3_800_000);
  });

  it("falls back to the website alone when no service is left to restore", () => {
    expect(reactivationBasketOf({ subscription: LAPSED, lines: [], forfeited: false }).services).toEqual(["managed-website"]);
    expect(reactivationBasketOf({ subscription: null, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
    });
  });
});
