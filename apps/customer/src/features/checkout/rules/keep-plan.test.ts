import type { Subscription } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { keepPlanOffered } from "./keep-plan";


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

describe("keepPlanOffered", () => {
  const CANCELLED = subscription({ cancelRequestedAt: new Date("2026-10-05T10:00:00Z") });

  it("is offered for the client's own cancel inside the paid month", () => {
    expect(keepPlanOffered({ subscription: CANCELLED, waiting: null }, NOW)).toBe(true);
    expect(keepPlanOffered({ subscription: { ...CANCELLED, status: "past_due" }, waiting: null }, NOW)).toBe(true);
  });

  it("is offered again while a keep checkout is open but not authorised", () => {
    expect(keepPlanOffered({ subscription: CANCELLED, waiting: { status: "incomplete" } }, NOW)).toBe(true);
  });

  it("is not offered once a new mandate is authorised", () => {
    expect(keepPlanOffered({ subscription: CANCELLED, waiting: { status: "active" } }, NOW)).toBe(false);
  });

  it("is not offered without the client's cancel, so a lapse or a running plan has no button", () => {
    expect(keepPlanOffered({ subscription: subscription(), waiting: null }, NOW)).toBe(false);
  });

  it("is not offered once the paid month is over, or when there is none", () => {
    const over = { ...CANCELLED, paidThroughAt: new Date("2026-10-06T10:00:00Z") };
    expect(keepPlanOffered({ subscription: over, waiting: null }, NOW)).toBe(false);
    expect(keepPlanOffered({ subscription: { ...CANCELLED, paidThroughAt: null }, waiting: null }, NOW)).toBe(false);
  });

  it("is not offered for a plan that has ended at the provider, an unpaid checkout, a manual plan or no plan", () => {
    expect(keepPlanOffered({ subscription: { ...CANCELLED, status: "cancelled" }, waiting: null }, NOW)).toBe(false);
    expect(keepPlanOffered({ subscription: { ...CANCELLED, status: "incomplete" }, waiting: null }, NOW)).toBe(false);
    expect(keepPlanOffered({ subscription: { ...CANCELLED, provider: "manual" }, waiting: null }, NOW)).toBe(false);
    expect(keepPlanOffered({ subscription: null, waiting: null }, NOW)).toBe(false);
  });
});
