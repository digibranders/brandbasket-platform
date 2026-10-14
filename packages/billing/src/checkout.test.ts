import { describe, expect, it } from "vitest";
import { CHECKOUT_REUSE_WINDOW_MS, decideCheckout, type CheckoutHistory, type LatestSubscription } from "./checkout";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const PLAN_ID = "plan-usd";
const TARGET = { planId: PLAN_ID, provider: "fake", referralCodeId: null } as const;
const TARGET_WITH_CODE = { planId: PLAN_ID, provider: "fake", referralCodeId: "code-1" } as const;
// Whether the business paid before no longer changes the decision: a returning customer checks out like anyone.
const NEVER_PAID: CheckoutHistory = { paymentUnderReview: false };
const PAID_BEFORE: CheckoutHistory = NEVER_PAID;

function incomplete(ageMs: number, overrides: Partial<LatestSubscription> = {}): LatestSubscription {
  return {
    id: "sub-1",
    planId: PLAN_ID,
    provider: "fake",
    providerSubscriptionId: "fake_sub_1",
    status: "incomplete",
    paidThroughAt: null,
    referralCodeId: null,
    createdAt: new Date(NOW.getTime() - ageMs),
    ...overrides,
  };
}

describe("decideCheckout", () => {
  it("opens a subscription when there is none", () => {
    expect(decideCheckout(null, TARGET, NOW, NEVER_PAID)).toEqual({ kind: "create" });
  });

  it("reuses an unpaid checkout younger than 24 hours", () => {
    expect(decideCheckout(incomplete(0), TARGET, NOW, NEVER_PAID)).toEqual({
      kind: "reuse",
      subscriptionId: "sub-1",
      providerSubscriptionId: "fake_sub_1",
    });
    expect(decideCheckout(incomplete(CHECKOUT_REUSE_WINDOW_MS - 1), TARGET, NOW, NEVER_PAID)).toMatchObject({
      kind: "reuse",
    });
  });

  it("replaces an unpaid checkout that is 24 hours old or more", () => {
    expect(decideCheckout(incomplete(CHECKOUT_REUSE_WINDOW_MS), TARGET, NOW, NEVER_PAID)).toEqual({
      kind: "replace",
      staleSubscriptionId: "sub-1",
    });
    expect(decideCheckout(incomplete(CHECKOUT_REUSE_WINDOW_MS * 30), TARGET, NOW, NEVER_PAID)).toMatchObject({
      kind: "replace",
    });
  });

  it("replaces an unpaid checkout for a plan that is no longer the one on sale", () => {
    expect(decideCheckout(incomplete(1000, { planId: "plan-retired" }), TARGET, NOW, NEVER_PAID)).toMatchObject({
      kind: "replace",
    });
  });

  it("replaces an unpaid checkout when a different referral code is applied", () => {
    // The checkout was opened at the full price; the customer has since applied a code. Reusing it would send
    // them back to a Razorpay subscription carrying no offer, and charge them the undiscounted amount.
    expect(decideCheckout(incomplete(1000), TARGET_WITH_CODE, NOW, NEVER_PAID)).toEqual({
      kind: "replace",
      staleSubscriptionId: "sub-1",
    });
  });

  it("replaces an unpaid checkout when the applied referral code is removed", () => {
    expect(decideCheckout(incomplete(1000, { referralCodeId: "code-1" }), TARGET, NOW, NEVER_PAID)).toMatchObject({
      kind: "replace",
    });
  });

  it("replaces an unpaid checkout when the applied referral code is swapped for another", () => {
    expect(
      decideCheckout(incomplete(1000, { referralCodeId: "code-2" }), TARGET_WITH_CODE, NOW, NEVER_PAID),
    ).toMatchObject({ kind: "replace" });
  });

  it("reuses an unpaid checkout carrying the same referral code", () => {
    expect(
      decideCheckout(incomplete(1000, { referralCodeId: "code-1" }), TARGET_WITH_CODE, NOW, NEVER_PAID),
    ).toEqual({ kind: "reuse", subscriptionId: "sub-1", providerSubscriptionId: "fake_sub_1" });
  });

  it("replaces an unpaid checkout opened at another provider", () => {
    expect(decideCheckout(incomplete(1000, { provider: "razorpay" }), TARGET, NOW, NEVER_PAID)).toMatchObject({
      kind: "replace",
    });
  });

  it("does not trust a checkout dated in the future", () => {
    expect(decideCheckout(incomplete(-60_000), TARGET, NOW, NEVER_PAID)).toMatchObject({ kind: "replace" });
  });

  it("opens a fresh subscription beside a cancelled checkout that was never paid", () => {
    expect(decideCheckout(incomplete(1000, { status: "cancelled" }), TARGET, NOW, NEVER_PAID)).toEqual({
      kind: "create",
    });
  });

  it("has nothing to sell to a business that is paid up", () => {
    const paid = incomplete(0, { status: "active", paidThroughAt: new Date(NOW.getTime() + 60_000) });
    expect(decideCheckout(paid, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "already-paid" });
  });

  it("treats a subscription cancelled inside its paid period as paid up", () => {
    const cancelled = incomplete(0, { status: "cancelled", paidThroughAt: new Date(NOW.getTime() + 60_000) });
    expect(decideCheckout(cancelled, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "already-paid" });
  });

  it.each([
    ["an active subscription past its paid period", "active", -60_000],
    ["a past-due subscription past its paid period", "past_due", -60_000],
    ["an inactive subscription, even inside its paid period", "inactive", 60_000],
  ] as const)("replaces %s, so a returning customer can pay again", (_label, status, offsetMs) => {
    const lapsed = incomplete(0, { status, paidThroughAt: new Date(NOW.getTime() + offsetMs) });
    expect(decideCheckout(lapsed, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "replace", staleSubscriptionId: "sub-1" });
  });

  it("opens a fresh subscription beside a cancelled one whose paid period ran out", () => {
    const ended = incomplete(0, { status: "cancelled", paidThroughAt: new Date(NOW.getTime() - 60_000) });
    expect(decideCheckout(ended, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "create" });
  });

  it("reuses a returning customer's own unpaid checkout, as for anyone", () => {
    expect(decideCheckout(incomplete(0), TARGET, NOW, PAID_BEFORE)).toEqual({
      kind: "reuse",
      subscriptionId: "sub-1",
      providerSubscriptionId: "fake_sub_1",
    });
  });

  it("replaces a subscription marked active whose first charge never came", () => {
    expect(decideCheckout(incomplete(0, { status: "active" }), TARGET, NOW, NEVER_PAID)).toEqual({
      kind: "replace",
      staleSubscriptionId: "sub-1",
    });
  });

  it("opens a subscription for a business with history but no subscription row", () => {
    expect(decideCheckout(null, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "create" });
  });

  it("takes no second payment while a received one is under review", () => {
    const underReview = { paymentUnderReview: true };
    expect(decideCheckout(null, TARGET, NOW, underReview)).toEqual({ kind: "payment-under-review" });
    expect(decideCheckout(incomplete(0, { status: "cancelled" }), TARGET, NOW, underReview)).toEqual({
      kind: "payment-under-review",
    });
  });

  it("still reports a paid-up business as paid while a duplicate payment is under review", () => {
    const paid = incomplete(0, { status: "active", paidThroughAt: new Date(NOW.getTime() + 60_000) });
    expect(decideCheckout(paid, TARGET, NOW, { paymentUnderReview: true })).toEqual({
      kind: "already-paid",
    });
  });
});
