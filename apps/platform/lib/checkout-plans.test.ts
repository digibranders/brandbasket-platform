import { MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { describe, expect, it } from "vitest";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY, CHECKOUT_STEPS } from "./checkout-plans";

describe("the checkout's words", () => {
  it("has copy for every plan on sale", () => {
    expect(Object.keys(CHECKOUT_PLAN_COPY).sort()).toEqual([...MONTHLY_ADD_ON_IDS].sort());
    for (const id of MONTHLY_ADD_ON_IDS) expect(CHECKOUT_PLAN_COPY[id].gets.length).toBeGreaterThan(0);
  });

  it("says the website's maintenance price from the figure it is given", () => {
    expect(CHECKOUT_PLAN_COPY["managed-website"].blurb("₹2,999")).toBe("Website free to build, ₹2,999 a month to keep it running");
  });

  it("names the package percentages from the pricing module", () => {
    expect(CHECKOUT_COPY.packageNote).toBe("Two plans are 10% off, all three are 20% off.");
    expect(CHECKOUT_COPY.allThree).toBe("All three plans: 20% off every month.");
  });

  it("has four steps and no em or en dash anywhere", () => {
    expect(CHECKOUT_STEPS).toHaveLength(4);
    const text = JSON.stringify([CHECKOUT_COPY, CHECKOUT_STEPS, Object.values(CHECKOUT_PLAN_COPY).map((copy) => [copy.gets, copy.blurb("₹1")])]);
    expect(text).not.toMatch(/[–—]/);
  });
});
