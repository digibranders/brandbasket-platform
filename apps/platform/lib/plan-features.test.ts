import { describe, expect, it } from "vitest";
import { featuresOf, MEMBERSHIP_TIERS, PLAN_FEATURES } from "./plan-features";

describe("what Managed Website includes", () => {
  it("is the one plan sold", () => {
    expect(MEMBERSHIP_TIERS).toEqual(["managed"]);
  });

  it("lists the plans document's Plan A, each line once, starting with the free website", () => {
    expect(PLAN_FEATURES[0]?.label).toBe("Your business website, built free");
    expect(new Set(PLAN_FEATURES.map((feature) => feature.id)).size).toBe(PLAN_FEATURES.length);
    expect(PLAN_FEATURES.map((feature) => feature.label)).toContain("2 small content edits a month, up to 30 minutes each");
    expect(featuresOf(["managed-website"])).toBe(PLAN_FEATURES);
  });

  it("follows the managed-website line in the basket, not the tier: other services alone carry no website allowances", () => {
    expect(featuresOf(["managed-website", "digital-growth"])).toBe(PLAN_FEATURES);
    expect(featuresOf(["digital-growth", "local-seo-aeo"])).toEqual([]);
  });
});
