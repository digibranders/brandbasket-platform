import { MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { describe, expect, it } from "vitest";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY, checkoutLead, checkoutSteps } from "./checkout-plans";

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

  it("shows the build and launch steps when the basket has the website", () => {
    expect(checkoutSteps(["managed-website"]).map((step) => step.title)).toEqual(["You pay", "Book your kickoff call", "We start building", "Your website is live"]);
    expect(checkoutSteps(["social-media", "managed-website"])).toHaveLength(4);
  });

  it("ends on 'We start on your plan' when the basket has no website", () => {
    for (const services of [["social-media"], ["paid-ads"], ["social-media", "paid-ads"]] as const) {
      expect(checkoutSteps(services)).toEqual([
        { title: "You pay", note: "Secure payment" },
        { title: "Book your kickoff call", note: "30 minutes, video" },
        { title: "We start on your plan", note: "Within 48 hours of the call" },
      ]);
    }
  });

  it("keeps the rupee lead as it was and leaves GST out of the dollar one", () => {
    expect(checkoutLead("INR", 1_800)).toBe("Choose the services you want. Prices are in rupees and include GST.");
    expect(checkoutLead("USD", 0)).toBe("Choose the services you want. Prices are in dollars.");
  });

  it("uses no em or en dash anywhere", () => {
    const text = JSON.stringify([CHECKOUT_COPY, checkoutLead("INR", 1_800), checkoutLead("USD", 0), checkoutSteps(["managed-website"]), checkoutSteps([]), Object.values(CHECKOUT_PLAN_COPY).map((copy) => [copy.gets, copy.blurb("₹1")])]);
    expect(text).not.toMatch(/[–—]/);
  });
});
