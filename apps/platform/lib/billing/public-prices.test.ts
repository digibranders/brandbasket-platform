import type { Plan } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { publicPrices } from "./public-prices";

describe("publicPrices", () => {
  it("publishes the prices and allowances, and nothing about how the plan is set up at the provider", () => {
    const plan = {
      id: "plan-id",
      code: "care-inr-2026-09",
      name: "Care",
      currency: "INR",
      initialAmountCents: 299_900,
      initialTermMonths: 1,
      recurringAmountCents: 299_900,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 30_000,
      includedChangeHours: 1,
      extraHourAmountCents: 142_500,
      includedBlogPosts: 100,
      blogPostBlockSize: 100,
      extraBlogPostsAmountCents: 47_500,
      tier: "premium",
      providerPlanId: "plan_secretish",
      taxRateBasisPoints: 1800,
    } satisfies Plan;

    expect(publicPrices(plan)).toEqual({
      monthlyCents: 299_900,
      extraHourCents: 142_500,
      extraPublishCents: 30_000,
      extraBlogPostsCents: 47_500,
      includedChangeHours: 1,
      includedPublishesPerMonth: 3,
      includedBlogPosts: 100,
      blogPostBlockSize: 100,
      taxRateBasisPoints: 1800,
    });
  });
});
