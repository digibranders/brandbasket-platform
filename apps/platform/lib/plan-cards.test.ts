import { describe, expect, it } from "vitest";
import type { Plan } from "@firstfold/db";
import { BRANDS } from "./brand";
import { planCardBase, planCardPrice, PLAN_NAMES } from "./plan-cards";

const plan = { recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as Plan;

describe("planCardPrice", () => {
  it("shows the monthly price before tax, the tax, and what a month takes in all", () => {
    expect(planCardPrice(plan)).toEqual({ amount: "₹2,999", terms: "a month + 18% GST", inAll: "₹3,538.82 in all, each month" });
  });

  it("leaves the in-all line out for a plan with no tax", () => {
    expect(planCardPrice({ ...plan, currency: "USD", recurringAmountCents: 6_900, taxRateBasisPoints: 0 })?.inAll).toBeNull();
  });

  it("has no price when no plan is on sale", () => {
    expect(planCardPrice(null)).toBeNull();
  });
});

describe("planCardBase", () => {
  it("names the plan the way the page does and lists what it includes", () => {
    const care = planCardBase("care", plan);
    expect(PLAN_NAMES).toEqual({ care: "Care plan", premium: "Premium Membership" });
    expect(care.name).toBe("Care plan");
    expect(care.list).toContain("OyeChats professional chatbot");
    expect(planCardBase("premium", null).price).toBeNull();
  });
});

describe("Premium's pitch under Fynix", () => {
  it("does not mention a listing, which Fynix does not sell", () => {
    const fynix = planCardBase("premium", null, BRANDS.fynix);
    expect(fynix.pitch).not.toMatch(/listing/i);
    expect(fynix.list.join(" ")).not.toMatch(/listing/i);
  });

  it("keeps Firstfold's pitch for Firstfold", () => {
    expect(planCardBase("premium", null, BRANDS.firstfold).pitch).toMatch(/listing/i);
  });
});
