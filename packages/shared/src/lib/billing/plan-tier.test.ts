import { describe, expect, it } from "vitest";
import { PLAN_TIER_LABELS, readPlanTier } from "./plan-tier";

describe("readPlanTier", () => {
  it("reads the two plans and nothing else", () => {
    expect(readPlanTier("care")).toBe("care");
    expect(readPlanTier("premium")).toBe("premium");
    expect(readPlanTier("Care")).toBeNull();
    expect(readPlanTier(["care"])).toBeNull();
    expect(readPlanTier(undefined)).toBeNull();
  });

  it("names both plans", () => {
    expect(PLAN_TIER_LABELS).toEqual({ care: "Care", premium: "Premium" });
  });
});
