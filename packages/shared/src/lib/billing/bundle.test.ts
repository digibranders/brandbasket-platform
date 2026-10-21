import { describe, expect, it } from "vitest";
import { bundleLines, bundleNetCents, nextBundledNetCents, readBundleSelection, websiteAloneNetCents } from "./bundle";

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
