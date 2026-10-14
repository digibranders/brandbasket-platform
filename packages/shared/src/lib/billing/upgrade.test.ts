import { describe, expect, it } from "vitest";
import {
  MIN_ONLINE_CHARGE_CENTS,
  MIN_UPGRADE_REMAINING_MS,
  quoteStillStands,
  quoteUpgrade,
  upgradeBlock,
  upgradeChargeDescription,
  type UpgradeQuoteInput,
  type UpgradeStanding,
} from "./upgrade";

const CARE = { tier: "care", currency: "INR", recurringAmountCents: 299_900, taxRateBasisPoints: 1_800 } as const;
const PREMIUM = { tier: "premium", currency: "INR", recurringAmountCents: 999_900, taxRateBasisPoints: 1_800 } as const;
const START = new Date("2026-10-08T00:00:00.000Z");
const END = new Date("2026-11-07T00:00:00.000Z");
const DAY = 86_400_000;

function input(overrides: Partial<UpgradeQuoteInput> = {}): UpgradeQuoteInput {
  return {
    from: CARE,
    to: PREMIUM,
    fromDiscountCents: 0,
    toDiscountCents: 0,
    period: { start: START, end: END },
    now: START,
    ...overrides,
  };
}

describe("quoteUpgrade", () => {
  it("charges the whole difference on the first day of the month, with GST on top", () => {
    const quote = quoteUpgrade(input());
    // ₹9,999 − ₹2,999 = ₹7,000 net, plus 18% = ₹8,260.
    expect(quote).toMatchObject({ kind: "quote", netDifferenceCents: 700_000, chargeCents: 826_000, free: false });
    expect(quote.kind === "quote" && quote.nextRenewalCents).toBe(1_179_882);
  });

  it("charges half the difference half way through the month", () => {
    const quote = quoteUpgrade(input({ now: new Date(START.getTime() + 15 * DAY) }));
    expect(quote).toMatchObject({ kind: "quote", netDifferenceCents: 350_000, chargeCents: 413_000, daysLeft: 15, periodDays: 30 });
  });

  it("works each plan's price after its own discount", () => {
    // Care at ₹500 off (₹2,499), Premium at ₹1,000 off (₹8,999): ₹6,500 net.
    const quote = quoteUpgrade(input({ fromDiscountCents: 50_000, toDiscountCents: 100_000 }));
    expect(quote).toMatchObject({ kind: "quote", netDifferenceCents: 650_000, chargeCents: 767_000 });
    expect(quote.kind === "quote" && quote.nextRenewalCents).toBe(Math.floor((899_900 * 11_800 + 5_000) / 10_000));
  });

  it("rounds a fractional paisa half up, in integers", () => {
    // 700000 * 7/30 = 163333.33 -> 163333.
    const quote = quoteUpgrade(input({ now: new Date(END.getTime() - 7 * DAY) }));
    expect(quote).toMatchObject({ kind: "quote", netDifferenceCents: 163_333 });
    // 700000 * 8/30 = 186666.67 -> 186667.
    expect(quoteUpgrade(input({ now: new Date(END.getTime() - 8 * DAY) }))).toMatchObject({ netDifferenceCents: 186_667 });
  });

  it("gives the same quote all day, whatever the hour, so a repeated press finds the same price", () => {
    const morning = quoteUpgrade(input({ now: new Date(START.getTime() + 10 * DAY + 1 * 3_600_000) }));
    const evening = quoteUpgrade(input({ now: new Date(START.getTime() + 10 * DAY + 20 * 3_600_000) }));
    expect(morning).toEqual(evening);
    expect(morning).toMatchObject({ kind: "quote", daysLeft: 20, periodDays: 30 });
  });

  it("charges for exactly the days it says, never more than the month", () => {
    const quote = quoteUpgrade(input({ now: new Date(START.getTime() + 5 * DAY) }));
    expect(quote).toMatchObject({ kind: "quote", daysLeft: 25, periodDays: 30, netDifferenceCents: Math.round((700_000 * 25) / 30) });
  });

  it("never charges more than the whole difference, even for a quote taken before the month began", () => {
    const quote = quoteUpgrade(input({ now: new Date(START.getTime() - 5 * DAY) }));
    expect(quote).toMatchObject({ kind: "quote", netDifferenceCents: 700_000 });
  });

  it("counts a part of a day as a day left, and the last day as one thirtieth of the difference", () => {
    const quote = quoteUpgrade(input({ now: new Date(END.getTime() - 3 * 60 * 60 * 1000) }));
    expect(quote).toMatchObject({ kind: "quote", daysLeft: 1, periodDays: 30, netDifferenceCents: 23_333 });
  });

  it("applies the move with no payment when the share is too small for the provider to take", () => {
    // About 1.1 hours left: the share is under a rupee after tax.
    const quote = quoteUpgrade(input({ now: new Date(END.getTime() - MIN_UPGRADE_REMAINING_MS - 60_000) }));
    expect(quote).toMatchObject({ kind: "quote", free: false });
    const tiny = quoteUpgrade(
      input({ to: { ...PREMIUM, recurringAmountCents: 300_000 }, now: new Date(END.getTime() - MIN_UPGRADE_REMAINING_MS - 60_000) }),
    );
    expect(tiny).toMatchObject({ kind: "quote", free: true, chargeCents: 0 });
    expect(MIN_ONLINE_CHARGE_CENTS).toBe(100);
  });

  it("waits for the renewal when less than an hour is left or the month is over", () => {
    expect(quoteUpgrade(input({ now: new Date(END.getTime() - MIN_UPGRADE_REMAINING_MS + 1) }))).toEqual({ kind: "refused", reason: "renewal-due" });
    expect(quoteUpgrade(input({ now: END }))).toEqual({ kind: "refused", reason: "renewal-due" });
    expect(quoteUpgrade(input({ now: new Date(END.getTime() + DAY) }))).toEqual({ kind: "refused", reason: "renewal-due" });
  });

  it("refuses a period with no length", () => {
    expect(quoteUpgrade(input({ period: { start: END, end: END } }))).toEqual({ kind: "refused", reason: "renewal-due" });
  });

  it("refuses plans in different currencies or with different tax", () => {
    expect(quoteUpgrade(input({ to: { ...PREMIUM, currency: "USD" } }))).toEqual({ kind: "refused", reason: "different-currency" });
    expect(quoteUpgrade(input({ to: { ...PREMIUM, taxRateBasisPoints: 0 } }))).toEqual({ kind: "refused", reason: "different-tax" });
  });

  it("refuses a move that is not dearer once discounts are counted", () => {
    expect(quoteUpgrade(input({ toDiscountCents: 700_000 }))).toEqual({ kind: "refused", reason: "not-an-upgrade" });
    expect(quoteUpgrade(input({ to: { ...PREMIUM, recurringAmountCents: 299_900 } }))).toEqual({ kind: "refused", reason: "not-an-upgrade" });
    expect(quoteUpgrade(input({ fromDiscountCents: 299_900 }))).toEqual({ kind: "refused", reason: "not-an-upgrade" });
  });
});

describe("quoteStillStands", () => {
  it("holds while the subscription is paid through the same date, and not once it has renewed or lost its date", () => {
    expect(quoteStillStands(END, new Date(END.getTime()))).toBe(true);
    expect(quoteStillStands(END, new Date(END.getTime() + 30 * DAY))).toBe(false);
    expect(quoteStillStands(END, null)).toBe(false);
  });
});

const READY: UpgradeStanding = {
  tier: "care",
  hasSubscription: true,
  provider: "razorpay",
  status: "active",
  hasAccess: true,
  hasEverPaid: true,
  cancelRequested: false,
  paymentUnderReview: false,
  upgradePaid: false,
};

describe("upgradeBlock", () => {
  it("lets a paid, active Care client on a provider subscription move up", () => {
    expect(upgradeBlock(READY)).toBeNull();
    expect(upgradeBlock({ ...READY, provider: "fake" })).toBeNull();
  });

  it("says a Premium client is already there, and that a paid upgrade is on its way", () => {
    expect(upgradeBlock({ ...READY, tier: "premium" })).toBe("already-premium");
    expect(upgradeBlock({ ...READY, tier: "premium", upgradePaid: true })).toBe("already-moving");
    expect(upgradeBlock({ ...READY, upgradePaid: true })).toBe("already-moving");
  });

  it("sends bank-transfer clients to staff", () => {
    expect(upgradeBlock({ ...READY, provider: "manual" })).toBe("manual-billing");
  });

  it("refuses a client who is leaving, whichever way they are leaving", () => {
    expect(upgradeBlock({ ...READY, cancelRequested: true })).toBe("ending");
    expect(upgradeBlock({ ...READY, status: "cancelled" })).toBe("ending");
  });

  it("refuses a client whose renewal is failing, one that lapsed, and one that never paid", () => {
    expect(upgradeBlock({ ...READY, status: "past_due" })).toBe("payment-failing");
    expect(upgradeBlock({ ...READY, status: "inactive", hasAccess: false })).toBe("lapsed");
    expect(upgradeBlock({ ...READY, status: "incomplete", hasAccess: false, hasEverPaid: false })).toBe("unpaid");
    expect(upgradeBlock({ ...READY, hasSubscription: false, provider: null, status: null, hasAccess: false, hasEverPaid: false })).toBe("unpaid");
  });

  it("holds the move while money waiting for staff is unresolved", () => {
    expect(upgradeBlock({ ...READY, paymentUnderReview: true })).toBe("under-review");
  });
});

describe("upgradeChargeDescription", () => {
  it("says how many days of the month are left, in the singular for one", () => {
    expect(upgradeChargeDescription(31)).toBe("Upgrade to Premium \u00B7 31 days left");
    expect(upgradeChargeDescription(1)).toBe("Upgrade to Premium \u00B7 1 day left");
  });
});
