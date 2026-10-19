import { describe, expect, it } from "vitest";
import { bundleLines, bundleNetCents, nextBundledNetCents, readBundleSelection } from "./bundle";

describe("readBundleSelection", () => {
  it("keeps catalogue ids once each, in the catalogue's order", () => {
    expect(readBundleSelection(["local-seo-aeo", "digital-growth", "digital-growth"])).toEqual(["digital-growth", "local-seo-aeo"]);
  });

  it("drops anything that is not a monthly add-on", () => {
    expect(readBundleSelection(["press-release", "local-seo", "social-media", "", "local-seo-aeo"])).toEqual(["local-seo-aeo"]);
    expect(readBundleSelection([])).toEqual([]);
  });
});

describe("bundleLines", () => {
  it("takes the 5% sign-up offer off each add-on, to the paisa", () => {
    expect(bundleLines(["digital-growth", "local-seo-aeo"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Digital Growth", listCents: 700_000, offerCents: 35_000, netCents: 665_000 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 2_500_000, offerCents: 125_000, netCents: 2_375_000 },
    ]);
  });

  it("prices a dollar plan's bundle in cents", () => {
    expect(bundleLines(["local-seo-aeo", "digital-growth"], "USD")).toEqual([
      { addOn: "digital-growth", title: "Digital Growth", listCents: 7_500, offerCents: 375, netCents: 7_125 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 35_000, offerCents: 1_750, netCents: 33_250 },
    ]);
  });

  it("adds the nets together, and is nothing for no add-ons", () => {
    expect(bundleNetCents(bundleLines(["digital-growth", "local-seo-aeo"], "INR"))).toBe(665_000 + 2_375_000);
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
