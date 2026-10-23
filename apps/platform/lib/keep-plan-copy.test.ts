import { describe, expect, it } from "vitest";
import { KEEP_PLAN_NOTE, keepPlanRefusal } from "./keep-plan-copy";

describe("keepPlanRefusal", () => {
  it("names the reason a press came back with, and nothing for any other mark", () => {
    expect(keepPlanRefusal("busy")).toMatch(/a lot of attempts/);
    expect(keepPlanRefusal("unavailable")).toMatch(/couldn’t open your payment/);
    expect(keepPlanRefusal("changed")).toMatch(/Something changed/);
    expect(keepPlanRefusal(undefined)).toBeNull();
    expect(keepPlanRefusal("toString")).toBeNull();
    expect(keepPlanRefusal(["busy"])).toBeNull();
  });

  it("says the plan carries on and the next bill does not change", () => {
    expect(KEEP_PLAN_NOTE).toBe("Keep my plan sets up your payment again, so your plan carries on as it is. Nothing changes on your next bill.");
  });
});
