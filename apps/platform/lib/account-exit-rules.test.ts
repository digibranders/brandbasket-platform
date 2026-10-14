import type { Plan, Subscription } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { eraseAfterFor, hasRunningAddOns, planClosureFor, retentionOfferTerms } from "./account-exit-rules";

const PLAN: Plan = {
  id: "plan-1",
  code: "premium-inr",
  name: "Premium",
  tier: "premium",
  currency: "INR",
  initialAmountCents: 999_900,
  initialTermMonths: 1,
  recurringAmountCents: 999_900,
  includedPublishesPerMonth: 0,
  extraPublishAmountCents: 0,
  includedChangeHours: 1,
  extraHourAmountCents: 142_500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 47_500,
  providerPlanId: "plan_base",
  taxRateBasisPoints: 1800,
};

const NOW = new Date("2026-10-06T10:00:00Z");

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    businessId: "biz-1",
    planId: "plan-1",
    provider: "razorpay",
    providerSubscriptionId: "sub_abc",
    providerStatus: "active",
    referralCodeId: null,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    pendingPlanId: null,
    pendingDiscountAmountCents: 0,
    status: "active",
    activatedAt: new Date("2026-09-20T10:00:00Z"),
    commitmentEndsAt: null,
    paidThroughAt: new Date("2026-10-20T10:00:00Z"),
    currentPeriodEnd: new Date("2026-10-20T10:00:00Z"),
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-09-20T09:00:00Z"),
    ...overrides,
  };
}

describe("retentionOfferTerms", () => {
  const open = { reason: "too_expensive" as const, subscription: subscription(), plan: PLAN, hasAccess: true };

  it("offers a paying member the reason's percentage off the net monthly price", () => {
    expect(retentionOfferTerms(open)).toEqual({ percent: 30, discountCents: 299_970, totalDiscountCents: 299_970 });
  });

  it("adds to a discount a code already gives", () => {
    const terms = retentionOfferTerms({ ...open, subscription: subscription({ referralCodeId: "code-1", discountAmountCents: 100_000 }) });
    expect(terms).toEqual({ percent: 30, discountCents: 299_970, totalDiscountCents: 399_970 });
  });

  it("offers nothing to someone closing the business", () => {
    expect(retentionOfferTerms({ ...open, reason: "closing_business" })).toBeNull();
    expect(retentionOfferTerms({ ...open, reason: "other" })).toBeNull();
  });

  it("offers nothing without a paid, running subscription", () => {
    expect(retentionOfferTerms({ ...open, subscription: null })).toBeNull();
    expect(retentionOfferTerms({ ...open, plan: null })).toBeNull();
    expect(retentionOfferTerms({ ...open, hasAccess: false })).toBeNull();
    expect(retentionOfferTerms({ ...open, upgradePaid: true })).toBeNull();
    expect(retentionOfferTerms({ ...open, subscription: subscription({ status: "incomplete" }) })).toBeNull();
    expect(retentionOfferTerms({ ...open, subscription: subscription({ status: "past_due" }) })).toBeNull();
    expect(retentionOfferTerms({ ...open, subscription: subscription({ status: "cancelled" }) })).toBeNull();
  });

  it("offers nothing to a plan already set to end, or that already took an offer", () => {
    expect(retentionOfferTerms({ ...open, subscription: subscription({ cancelRequestedAt: NOW }) })).toBeNull();
    expect(
      retentionOfferTerms({ ...open, subscription: subscription({ referralCodeId: "c", discountAmountCents: 1, retentionDiscountCents: 1 }) }),
    ).toBeNull();
  });

  it("offers nothing on a plan whose first payment differs from its monthly price", () => {
    expect(retentionOfferTerms({ ...open, plan: { ...PLAN, initialAmountCents: 300_000 } })).toBeNull();
  });

  it("offers nothing when a code already takes the most", () => {
    const sub = subscription({ referralCodeId: "code-1", discountAmountCents: 900_000 });
    expect(retentionOfferTerms({ ...open, subscription: sub })).toBeNull();
  });
});

describe("planClosureFor", () => {
  it.each([
    ["no subscription", null, "none"],
    ["a cancelled one", subscription({ status: "cancelled" }), "none"],
    ["an unpaid checkout", subscription({ status: "incomplete" }), "drop-unpaid"],
    ["a manual unpaid checkout", subscription({ status: "incomplete", provider: "manual" }), "none"],
    ["a running plan at Razorpay", subscription(), "end-with-period"],
    ["a plan behind on payment", subscription({ status: "past_due" }), "end-with-period"],
    ["a plan collected by hand", subscription({ provider: "manual" }), "note-only"],
    ["a plan already set to end", subscription({ cancelRequestedAt: NOW }), "already-ending"],
  ] as const)("%s", (_label, sub, expected) => {
    expect(planClosureFor(sub)).toBe(expected);
  });
});

describe("eraseAfterFor", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("counts the grace period from the end of the paid period", () => {
    expect(eraseAfterFor(subscription(), NOW)).toEqual(new Date(new Date("2026-10-20T10:00:00Z").getTime() + 30 * DAY));
  });

  it("counts it from now when nothing is paid ahead", () => {
    expect(eraseAfterFor(null, NOW)).toEqual(new Date(NOW.getTime() + 30 * DAY));
    expect(eraseAfterFor(subscription({ paidThroughAt: new Date("2026-09-01T00:00:00Z") }), NOW)).toEqual(
      new Date(NOW.getTime() + 30 * DAY),
    );
    expect(eraseAfterFor(subscription({ paidThroughAt: null }), NOW)).toEqual(new Date(NOW.getTime() + 30 * DAY));
  });
});

describe("hasRunningAddOns", () => {
  it("is true while any add-on is active, past due or waiting to start, even one already set to stop", () => {
    expect(hasRunningAddOns([{ status: "cancelled" }, { status: "active" }])).toBe(true);
    expect(hasRunningAddOns([{ status: "past_due" }])).toBe(true);
    expect(hasRunningAddOns([{ status: "scheduled" }])).toBe(true);
  });

  it("is false when there are none, or none that is paying", () => {
    expect(hasRunningAddOns([])).toBe(false);
    expect(hasRunningAddOns([{ status: "cancelled" }, { status: "incomplete" }, { status: "halted" }])).toBe(false);
  });
});
