import { describe, expect, it } from "vitest";
import { bundleLines, bundleNetCents, nextBundledNetCents, readBundleSelection } from "./bundle";

describe("readBundleSelection", () => {
  it("keeps catalogue ids once each, in the catalogue's order", () => {
    expect(readBundleSelection(["advertising", "social-media", "social-media"])).toEqual(["social-media", "advertising"]);
  });

  it("drops anything that is not a monthly add-on", () => {
    expect(readBundleSelection(["press-release", "local-seo", "", "lead-generation"])).toEqual(["lead-generation"]);
    expect(readBundleSelection([])).toEqual([]);
  });
});

describe("bundleLines", () => {
  it("takes the 5% lifetime offer off each add-on, to the paisa", () => {
    expect(bundleLines(["social-media", "lead-generation", "advertising"], "INR")).toEqual([
      { addOn: "social-media", title: "Social media", listCents: 199_900, offerCents: 9_995, netCents: 189_905 },
      { addOn: "lead-generation", title: "Outreach and lead generation", listCents: 499_900, offerCents: 24_995, netCents: 474_905 },
      { addOn: "advertising", title: "Paid advertising", listCents: 599_900, offerCents: 29_995, netCents: 569_905 },
    ]);
  });

  it("prices a dollar plan's bundle in cents", () => {
    expect(bundleLines(["social-media", "advertising"], "USD")).toEqual([
      { addOn: "social-media", title: "Social media", listCents: 10_000, offerCents: 500, netCents: 9_500 },
      { addOn: "advertising", title: "Paid advertising", listCents: 12_500, offerCents: 625, netCents: 11_875 },
    ]);
  });

  it("adds the nets together, and is nothing for no add-ons", () => {
    expect(bundleNetCents(bundleLines(["social-media", "advertising"], "INR"))).toBe(189_905 + 569_905);
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
