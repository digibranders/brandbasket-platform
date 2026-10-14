import { describe, expect, it } from "vitest";
import { CARE_INCLUDES, featuresOf, includes, PLAN_FEATURES, premiumOnlyFeatures } from "./plan-features";

describe("the plan table", () => {
  it("has the website's sixteen rows", () => {
    expect(PLAN_FEATURES).toHaveLength(16);
    expect(new Set(PLAN_FEATURES.map((feature) => feature.id)).size).toBe(16);
  });

  it("gives Care the four website rows, all of which Premium has too", () => {
    const care = featuresOf("care").map((feature) => feature.id);
    expect(care).toEqual(["website", "website-management", "chatbot", "hosting"]);
    for (const feature of featuresOf("care")) expect(includes(feature.premium)).toBe(true);
  });

  it("makes everything Care has a Premium thing too, so Premium is Care and more", () => {
    expect(featuresOf("premium").length).toBeGreaterThan(featuresOf("care").length);
  });

  it("names what only Premium adds, with the appointments system among it and the website rows not", () => {
    const only = premiumOnlyFeatures().map((feature) => feature.id);
    expect(only).toContain("appointments");
    expect(only).toContain("listing");
    expect(only).not.toContain("website");
  });

  it("describes each of Care's four rows for its dashboard", () => {
    expect(CARE_INCLUDES.map((item) => item.id)).toEqual(featuresOf("care").map((feature) => feature.id));
  });
});
