import type { BillingState, BundledAddOn, Plan, Subscription, SubscriptionStatus } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { summariseBilling } from "./status";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const LATER = new Date("2026-12-16T12:00:00.000Z");
const EARLIER = new Date("2026-08-16T12:00:00.000Z");

const PLAN = { id: "plan-usd", currency: "USD", initialAmountCents: 22500 } as Plan;
const WEBSITE_LINE = { addOn: "managed-website", status: "active" } as BundledAddOn;
const SOCIAL_LINE = { addOn: "digital-growth", status: "active" } as BundledAddOn;

function subscription(status: SubscriptionStatus, paidThroughAt: Date | null): Subscription {
  return { id: "sub-1", status, paidThroughAt } as Subscription;
}

function state(sub: Subscription | null, history: Partial<BillingState> = {}): BillingState {
  return {
    currency: "USD",
    tier: "managed",
    upgradePaid: false,
    subscription: sub,
    // A subscription with a paid-through date was activated by a payment.
    hasEverPaid: sub?.paidThroughAt !== null && sub?.paidThroughAt !== undefined,
    paymentUnderReview: false,
    plan: PLAN,
    addOns: [],
    ...history,
  };
}

describe("summariseBilling", () => {
  it("is unpaid with no subscription", () => {
    expect(summariseBilling(state(null), NOW)).toEqual({
      status: "unpaid",
      hasAccess: false,
      hasWebsite: false,
      subscription: null,
      tier: "managed",
      upgradePaid: false,
      plan: PLAN,
      paymentUnderReview: false,
      renewalFailingUntil: null,
    });
  });

  it("says when a move up to Premium has been paid for and is waiting for the renewal", () => {
    expect(summariseBilling(state(null, { upgradePaid: true, tier: "managed" }), NOW)).toMatchObject({ upgradePaid: true, tier: "managed" });
  });

  it("carries the tier the business is on, so a Care client's dashboard can tell", () => {
    expect(summariseBilling(state(null, { tier: "managed" }), NOW)).toMatchObject({ tier: "managed" });
  });

  it("is unpaid while a checkout is open", () => {
    expect(summariseBilling(state(subscription("incomplete", null)), NOW)).toMatchObject({
      status: "unpaid",
      hasAccess: false,
    });
  });

  it("is unpaid when the newest subscription is a replaced checkout that was never paid", () => {
    expect(summariseBilling(state(subscription("cancelled", null)), NOW)).toMatchObject({
      status: "unpaid",
      hasAccess: false,
    });
  });

  it.each(["active", "past_due", "cancelled"] as const)("is paid while a %s subscription's period runs", (status) => {
    expect(summariseBilling(state(subscription(status, LATER)), NOW)).toMatchObject({
      status: "paid",
      hasAccess: true,
    });
  });

  it.each([
    ["an active subscription whose period ended", subscription("active", EARLIER)],
    ["an active subscription ending exactly now", subscription("active", NOW)],
    ["an inactive subscription, even with time left", subscription("inactive", LATER)],
    ["a cancelled subscription whose period ended", subscription("cancelled", EARLIER)],
  ])("is lapsed for %s", (_label, sub) => {
    expect(summariseBilling(state(sub), NOW)).toMatchObject({ status: "lapsed", hasAccess: false });
  });

  it("is lapsed, never unpaid, for a business that paid once, whatever its newest row is", () => {
    expect(summariseBilling(state(subscription("incomplete", null), { hasEverPaid: true }), NOW)).toMatchObject({
      status: "lapsed",
    });
    expect(summariseBilling(state(null, { hasEverPaid: true }), NOW)).toMatchObject({ status: "lapsed" });
  });

  it("says a renewal is failing, and until when the paid period lasts, while Razorpay retries inside it", () => {
    expect(summariseBilling(state(subscription("past_due", LATER)), NOW)).toMatchObject({ renewalFailingUntil: LATER });
  });

  it.each([
    ["an active subscription", subscription("active", LATER)],
    ["a cancelled subscription still inside its period", subscription("cancelled", LATER)],
    ["a past-due subscription whose period has ended, which is lapsed", subscription("past_due", EARLIER)],
    ["a halted subscription", subscription("inactive", LATER)],
  ])("does not say a renewal is failing for %s", (_label, sub) => {
    expect(summariseBilling(state(sub), NOW).renewalFailingUntil).toBeNull();
  });

  it("carries a payment under review through", () => {
    expect(summariseBilling(state(null, { paymentUnderReview: true }), NOW)).toMatchObject({
      status: "unpaid",
      paymentUnderReview: true,
    });
  });

  it("passes the plan through, including none", () => {
    expect(summariseBilling({ ...state(null), currency: "INR", plan: null }, NOW).plan).toBeNull();
  });

  it("has a website only with an active Managed Website line on a paid subscription", () => {
    const paid = subscription("active", LATER);
    expect(summariseBilling(state(paid, { addOns: [SOCIAL_LINE, WEBSITE_LINE] }), NOW).hasWebsite).toBe(true);
    expect(summariseBilling(state(paid, { addOns: [SOCIAL_LINE] }), NOW).hasWebsite).toBe(false);
    expect(summariseBilling(state(paid), NOW).hasWebsite).toBe(false);
    expect(summariseBilling(state(subscription("active", EARLIER), { addOns: [WEBSITE_LINE] }), NOW).hasWebsite).toBe(false);
  });
});
