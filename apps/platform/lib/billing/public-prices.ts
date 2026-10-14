import type { Plan } from "@firstfold/db";

/** One currency's prices as the marketing website reads them: net of tax, in minor units. */
export interface PublicPrices {
  readonly monthlyCents: number;
  readonly extraHourCents: number;
  readonly extraPublishCents: number;
  readonly extraBlogPostsCents: number;
  readonly includedChangeHours: number;
  readonly includedPublishesPerMonth: number;
  readonly includedBlogPosts: number;
  readonly blogPostBlockSize: number;
  readonly taxRateBasisPoints: number;
}

export function publicPrices(plan: Plan): PublicPrices {
  return {
    monthlyCents: plan.recurringAmountCents,
    extraHourCents: plan.extraHourAmountCents,
    extraPublishCents: plan.extraPublishAmountCents,
    extraBlogPostsCents: plan.extraBlogPostsAmountCents,
    includedChangeHours: plan.includedChangeHours,
    includedPublishesPerMonth: plan.includedPublishesPerMonth,
    includedBlogPosts: plan.includedBlogPosts,
    blogPostBlockSize: plan.blogPostBlockSize,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  };
}
