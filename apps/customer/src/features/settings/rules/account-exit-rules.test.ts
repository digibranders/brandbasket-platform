import type { Subscription } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { eraseAfterFor, hasRunningAddOns, packageEndsFor, planEndsAt, planClosureFor } from "./account-exit-rules";

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
    discountMonthsLeft: null,
    nextDiscountAmountCents: null,
    retentionDiscountCents: 0,
    pendingPlanId: null,
    pendingDiscountAmountCents: 0,
    bundledAddOnNetCents: 0,
    pendingBundledAddOnNetCents: null,
    adCreditCents: 0,
    status: "active",
    activatedAt: new Date("2026-09-20T10:00:00Z"),
    commitmentEndsAt: null,
    paidThroughAt: new Date("2026-10-20T10:00:00Z"),
    currentPeriodEnd: new Date("2026-10-20T10:00:00Z"),
    cancelRequestedAt: null,
    cancelledAt: null,
    continuesId: null,
    startAt: null,
    createdAt: new Date("2026-09-20T09:00:00Z"),
    ...overrides,
  };
}

describe("packageEndsFor", () => {
  const ALL_THREE = ["managed-website", "digital-growth", "local-seo-aeo"] as const;
  const BASKET = { services: ALL_THREE, forfeited: false, adCreditCents: 300_000, currency: "INR" } as const;

  it("lists the package price, the ad credit and the full price on return for an all-three client", () => {
    expect(packageEndsFor(BASKET)).toEqual([
      "Your package price (20% off)",
      "\u20B93,000 a month of ad credit",
      "If you come back, every service is at its own price",
    ]);
  });

  it("takes the percentage from the services that are staying", () => {
    expect(packageEndsFor({ ...BASKET, services: ["managed-website", "digital-growth"], adCreditCents: 150_000 })).toEqual([
      "Your package price (10% off)",
      "\u20B91,500 a month of ad credit",
      "If you come back, every service is at its own price",
    ]);
  });

  it("leaves the ad credit line out when the package has none", () => {
    expect(packageEndsFor({ ...BASKET, services: ["managed-website", "local-seo-aeo"], adCreditCents: 0 })).toEqual([
      "Your package price (10% off)",
      "If you come back, every service is at its own price",
    ]);
  });

  it("writes a dollar ad credit in dollars", () => {
    expect(packageEndsFor({ ...BASKET, currency: "USD", adCreditCents: 6_000 })[1]).toBe("$60 a month of ad credit");
  });

  it("lists nothing for a single service", () => {
    expect(packageEndsFor({ ...BASKET, services: ["managed-website"], adCreditCents: 0 })).toEqual([]);
  });

  it("lists nothing once the business has given the package offer up", () => {
    expect(packageEndsFor({ ...BASKET, forfeited: true, adCreditCents: 0 })).toEqual([]);
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

describe("planEndsAt", () => {
  it("is the end of the paid period while a plan is running", () => {
    expect(planEndsAt(subscription(), NOW)).toEqual(new Date("2026-10-20T10:00:00Z"));
    expect(planEndsAt(subscription({ status: "past_due" }), NOW)).toEqual(new Date("2026-10-20T10:00:00Z"));
    expect(planEndsAt(subscription({ cancelRequestedAt: NOW }), NOW)).toEqual(new Date("2026-10-20T10:00:00Z"));
    expect(planEndsAt(subscription({ provider: "manual" }), NOW)).toEqual(new Date("2026-10-20T10:00:00Z"));
  });

  it("is nothing when there is no plan to end", () => {
    expect(planEndsAt(null, NOW)).toBeNull();
    expect(planEndsAt(subscription({ status: "cancelled" }), NOW)).toBeNull();
    expect(planEndsAt(subscription({ status: "incomplete" }), NOW)).toBeNull();
  });

  it("is nothing once the paid period is over, or when it is not known", () => {
    expect(planEndsAt(subscription({ paidThroughAt: new Date("2026-10-06T10:00:00Z") }), NOW)).toBeNull();
    expect(planEndsAt(subscription({ paidThroughAt: null }), NOW)).toBeNull();
  });
});
