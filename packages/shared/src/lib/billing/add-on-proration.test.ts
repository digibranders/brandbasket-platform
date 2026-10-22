import { describe, expect, it } from "vitest";
import {
  addOnBlock,
  MIN_ADD_REMAINING_MS,
  MIN_ONLINE_CHARGE_CENTS,
  quoteAddOn,
  type AddOnQuoteInput,
  type AddOnStanding,
} from "./add-on-proration";

// The worked example in docs/plans/13-platform-add-ons-after-signup.md: a month paid from 19 Oct to 19 Nov (31 days).
const START = new Date("2026-10-19T00:00:00.000Z");
const END = new Date("2026-11-19T00:00:00.000Z");
const FIFTH_NOV = new Date("2026-11-05T06:00:00.000Z");
const DAY = 86_400_000;

function input(overrides: Partial<AddOnQuoteInput> = {}): AddOnQuoteInput {
  return {
    netCents: 700_000,
    taxRateBasisPoints: 1_800,
    renewalNetCents: 299_900 + 700_000,
    renewalDiscountCents: 0,
    period: { start: START, end: END },
    now: FIFTH_NOV,
    ...overrides,
  };
}

describe("quoteAddOn", () => {
  it("charges Social Media and Ads for the 14 days left of a 31-day month, with GST, and the full basket from the renewal", () => {
    expect(quoteAddOn(input())).toEqual({
      kind: "quote",
      netCents: 316_129,
      chargeCents: 373_032,
      free: false,
      nextRenewalCents: 1_179_882,
      periodEnd: END,
      daysLeft: 14,
      periodDays: 31,
    });
  });

  it("charges Local SEO + AEO and dollar add-ons the same way", () => {
    expect(quoteAddOn(input({ netCents: 2_499_900 }))).toMatchObject({ netCents: 1_128_987, chargeCents: 1_332_205 });
    expect(quoteAddOn(input({ netCents: 7_500, taxRateBasisPoints: 0, renewalNetCents: 15_000 }))).toMatchObject({
      netCents: 3_387,
      chargeCents: 3_387,
      nextRenewalCents: 15_000,
    });
  });

  it("prices the renewal after the subscription's frozen discount", () => {
    // ₹500 off the plan: ₹9,499 net from the renewal, plus 18%.
    expect(quoteAddOn(input({ renewalDiscountCents: 50_000 }))).toMatchObject({ nextRenewalCents: 1_120_882 });
  });

  it("gives the same quote all day, so a repeated press finds the same price", () => {
    const early = quoteAddOn(input({ now: new Date("2026-11-05T00:30:00.000Z") }));
    const late = quoteAddOn(input({ now: new Date("2026-11-05T23:30:00.000Z") }));
    expect(early).toEqual(late);
  });

  it("charges the whole month on its first day, and never more, even before the month began", () => {
    expect(quoteAddOn(input({ now: START }))).toMatchObject({ netCents: 700_000, daysLeft: 31 });
    expect(quoteAddOn(input({ now: new Date(START.getTime() - 5 * DAY) }))).toMatchObject({ netCents: 700_000, daysLeft: 31 });
  });

  it("counts a part of a day as a day left", () => {
    // 700000 / 31 = 22580.6 -> 22581.
    expect(quoteAddOn(input({ now: new Date(END.getTime() - 3 * 3_600_000) }))).toMatchObject({ daysLeft: 1, netCents: 22_581 });
  });

  it("applies an add-on with no payment when its share is too small for the provider to take", () => {
    expect(quoteAddOn(input({ netCents: 50 }))).toMatchObject({ kind: "quote", free: true, chargeCents: 0 });
    expect(MIN_ONLINE_CHARGE_CENTS).toBe(100);
  });

  it("waits for the renewal when less than an hour is left, the month is over, or it has no length", () => {
    expect(quoteAddOn(input({ now: new Date(END.getTime() - MIN_ADD_REMAINING_MS + 1) }))).toEqual({ kind: "refused", reason: "renewal-due" });
    expect(quoteAddOn(input({ now: END }))).toEqual({ kind: "refused", reason: "renewal-due" });
    expect(quoteAddOn(input({ period: { start: END, end: END } }))).toEqual({ kind: "refused", reason: "renewal-due" });
  });
});

const READY: AddOnStanding = {
  hasSubscription: true,
  provider: "razorpay",
  status: "active",
  hasAccess: true,
  hasEverPaid: true,
  cancelRequested: false,
  paymentUnderReview: false,
  addOnActive: false,
};

describe("addOnBlock", () => {
  it("lets a paid, active client on a provider subscription add one", () => {
    expect(addOnBlock(READY)).toBeNull();
    expect(addOnBlock({ ...READY, provider: "fake" })).toBeNull();
  });

  it("says when the add-on is already in the plan payment", () => {
    expect(addOnBlock({ ...READY, addOnActive: true })).toBe("already-added");
  });

  it("sends bank-transfer clients to staff", () => {
    expect(addOnBlock({ ...READY, provider: "manual" })).toBe("manual-billing");
  });

  it("refuses a client who is leaving, whose renewal is failing, who lapsed, or who never paid", () => {
    expect(addOnBlock({ ...READY, cancelRequested: true })).toBe("ending");
    expect(addOnBlock({ ...READY, status: "cancelled" })).toBe("ending");
    expect(addOnBlock({ ...READY, status: "past_due" })).toBe("payment-failing");
    expect(addOnBlock({ ...READY, status: "inactive", hasAccess: false })).toBe("lapsed");
    expect(addOnBlock({ ...READY, status: "incomplete", hasAccess: false, hasEverPaid: false })).toBe("unpaid");
    expect(addOnBlock({ ...READY, hasSubscription: false, provider: null, status: null, hasAccess: false, hasEverPaid: false })).toBe("unpaid");
  });

  it("holds the add while money waiting for staff is unresolved", () => {
    expect(addOnBlock({ ...READY, paymentUnderReview: true })).toBe("under-review");
  });
});
