import type { Plan } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { blogAllowance, CHARGE_KIND_LABELS, chargeAmountCents, chargeLabel, chargePricing, isStaffChargeKind } from "./charges";

type PricedPlan = Pick<
  Plan,
  | "currency"
  | "taxRateBasisPoints"
  | "extraHourAmountCents"
  | "extraPublishAmountCents"
  | "extraBlogPostsAmountCents"
  | "includedBlogPosts"
  | "blogPostBlockSize"
>;

const INR: PricedPlan = {
  currency: "INR",
  taxRateBasisPoints: 1800,
  extraHourAmountCents: 142_500,
  extraPublishAmountCents: 95_000,
  extraBlogPostsAmountCents: 47_500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
};

const USD: PricedPlan = {
  ...INR,
  currency: "USD",
  taxRateBasisPoints: 0,
  extraHourAmountCents: 1_500,
  extraPublishAmountCents: 1_000,
  extraBlogPostsAmountCents: 500,
};

describe("chargePricing", () => {
  it("prices each kind from the plan, in the plan's currency", () => {
    expect(chargePricing("change_hours", INR)).toEqual({ unitAmountCents: 142_500, description: "Extra change hours", unit: "hour" });
    expect(chargePricing("extra_publish", USD)).toEqual({ unitAmountCents: 1_000, description: "Extra publish", unit: "publish" });
    expect(chargePricing("blog_posts", INR)).toEqual({
      unitAmountCents: 47_500,
      description: "100 more blog posts",
      unit: "block of 100 posts",
    });
  });

  it("leaves a custom charge's price to staff", () => {
    expect(chargePricing("custom", INR)).toEqual({ unitAmountCents: null, description: "", unit: null });
  });
});

describe("chargeAmountCents", () => {
  it("is the unit price, GST included, times the quantity", () => {
    expect(chargeAmountCents(142_500, 2)).toBe(285_000);
    expect(chargeAmountCents(47_500, 1)).toBe(47_500);
    expect(chargeAmountCents(1_500, 3)).toBe(4_500);
  });

  it("refuses a quantity that is not a positive whole number", () => {
    expect(() => chargeAmountCents(1_500, 0)).toThrow(RangeError);
    expect(() => chargeAmountCents(1_500, 1.5)).toThrow(RangeError);
  });
});

describe("blogAllowance", () => {
  it("is the included posts plus every block paid for", () => {
    expect(blogAllowance(INR, 0)).toBe(100);
    expect(blogAllowance(INR, 2)).toBe(300);
  });
});

describe("chargeLabel", () => {
  it("says how much of what", () => {
    expect(chargeLabel({ kind: "change_hours", description: "Extra change hours", quantity: 2 })).toBe("Extra change hours · 2 h");
    expect(chargeLabel({ kind: "change_hours", description: "Extra change hours", quantity: 1 })).toBe("Extra change hours · 1 h");
    expect(chargeLabel({ kind: "extra_publish", description: "Extra publish", quantity: 3 })).toBe("Extra publish × 3");
    expect(chargeLabel({ kind: "custom", description: "Logo refresh", quantity: 1 })).toBe("Logo refresh");
    expect(chargeLabel({ kind: "blog_posts", description: "100 more blog posts", quantity: 1 })).toBe("100 more blog posts");
    expect(chargeLabel({ kind: "blog_posts", description: "100 more blog posts", quantity: 2 })).toBe("100 more blog posts × 2");
  });
});

describe("press release charges", () => {
  it("are named in the console but are not a kind staff can add by hand", () => {
    expect(CHARGE_KIND_LABELS.press_release).toBe("Press release");
    expect(isStaffChargeKind("press_release")).toBe(false);
  });
});
