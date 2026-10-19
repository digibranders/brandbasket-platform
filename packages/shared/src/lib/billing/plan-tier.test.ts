import { describe, expect, it } from "vitest";
import { PLAN_TIER_LABELS, readPlanTier } from "./plan-tier";

describe("readPlanTier", () => {
  it("reads Managed Website and nothing else, Fynix's old tiers included", () => {
    expect(readPlanTier("managed")).toBe("managed");
    expect(readPlanTier("care")).toBeNull();
    expect(readPlanTier("premium")).toBeNull();
    expect(readPlanTier("Managed")).toBeNull();
    expect(readPlanTier(["managed"])).toBeNull();
    expect(readPlanTier(undefined)).toBeNull();
  });

  it("names the plan", () => {
    expect(PLAN_TIER_LABELS).toEqual({ managed: "Managed Website" });
  });
});
