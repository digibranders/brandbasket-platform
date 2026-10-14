import { describe, expect, it } from "vitest";
import {
  cashOutFigure,
  cashOutShares,
  codeStatus,
  monthLabel,
  moneyFigure,
  monthRows,
  payingLine,
  monthsWindowStart,
  primaryCashOut,
} from "./affiliate-dashboard";

const NOW = new Date("2026-10-08T10:00:00.000Z");
const LIVE = { active: true, expiresAt: null, maxRedemptions: null, redemptions: 3 };

describe("codeStatus", () => {
  it("calls a working code live", () => {
    expect(codeStatus(LIVE, true, NOW)).toEqual({ tone: "done", label: "Live" });
  });

  it("pauses every code of an affiliate who is switched off, and any code switched off itself", () => {
    expect(codeStatus(LIVE, false, NOW).label).toBe("Paused");
    expect(codeStatus({ ...LIVE, active: false }, true, NOW).label).toBe("Paused");
  });

  it("says when a code has lapsed or been used up", () => {
    expect(codeStatus({ ...LIVE, expiresAt: new Date("2026-10-08T10:00:00.000Z") }, true, NOW).label).toBe("Expired");
    expect(codeStatus({ ...LIVE, expiresAt: new Date("2026-10-09T00:00:00.000Z") }, true, NOW).label).toBe("Live");
    expect(codeStatus({ ...LIVE, maxRedemptions: 3 }, true, NOW)).toEqual({ tone: "waiting", label: "Fully used" });
    expect(codeStatus({ ...LIVE, maxRedemptions: 4 }, true, NOW).label).toBe("Live");
  });
});

describe("money figures", () => {
  it("shows nothing as ₹0 and several currencies together", () => {
    expect(moneyFigure([])).toBe("₹0");
    expect(moneyFigure([{ currency: "INR", cents: 0 }])).toBe("₹0");
    expect(moneyFigure([{ currency: "INR", cents: 420_000 }])).toBe("₹4,200");
    expect(
      moneyFigure([
        { currency: "INR", cents: 420_000 },
        { currency: "USD", cents: 1_200 },
      ]),
    ).toBe("₹4,200 + $12");
  });
});

describe("monthLabel", () => {
  it("adds the limit only when there is one", () => {
    expect(monthLabel(2, null)).toBe("Month 2");
    expect(monthLabel(2, 12)).toBe("Month 2 of 12");
  });
});

const INR = (overrides: Partial<Parameters<typeof cashOutShares>[0]> & { currency?: "INR" | "USD"; cancelledCents?: number; cashedOutCents?: number } = {}) => ({
  currency: "INR" as const,
  earnedCents: 1_000_000,
  pendingCents: 200_000,
  cashedOutCents: 800_000,
  withheldCents: 0,
  receivedCents: 800_000,
  cancelledCents: 0,
  ...overrides,
});

describe("cash-out figures", () => {
  it("sum each figure over the currencies, and read ₹0 when there is none", () => {
    expect(cashOutFigure([], "receivedCents")).toBe("₹0");
    expect(cashOutFigure([INR({ receivedCents: 800_000 })], "receivedCents")).toBe("₹8,000");
    expect(cashOutFigure([INR({ receivedCents: 800_000 }), INR({ currency: "USD", receivedCents: 1_200 })], "receivedCents")).toBe("₹8,000 + $12");
  });

  it("chooses the currency with the most earned as the primary one", () => {
    expect(primaryCashOut([])).toBeNull();
    expect(primaryCashOut([INR({ earnedCents: 5_000 }), INR({ currency: "USD", earnedCents: 9_000 })])?.currency).toBe("USD");
  });
});

describe("cashOutShares", () => {
  it("divides what was earned into received, withheld and pending, adding to 100", () => {
    // ₹10,000 earned: ₹8,000 cashed out of which ₹2,000 withheld, so ₹6,000 received; ₹2,000 pending.
    expect(cashOutShares({ earnedCents: 1_000_000, receivedCents: 600_000, withheldCents: 200_000, pendingCents: 200_000 })).toEqual({ received: 60, withheld: 20, pending: 20 });
  });

  it("keeps a small part visible and still adds to exactly 100", () => {
    const shares = cashOutShares({ earnedCents: 1_000_000, receivedCents: 995_000, withheldCents: 1_000, pendingCents: 4_000 });
    expect(shares.withheld).toBe(2);
    expect(shares.received + shares.withheld + shares.pending).toBe(100);
  });

  it("is all zero when nothing has been earned", () => {
    expect(cashOutShares({ earnedCents: 0, receivedCents: 0, withheldCents: 0, pendingCents: 0 })).toEqual({ received: 0, withheld: 0, pending: 0 });
  });
});

describe("the month by month list", () => {
  // 20 October 2026, India.
  const NOW = new Date("2026-10-20T10:00:00.000Z");
  const month = (key: string, payingMembers: number, cents: number, refunded = 0, currency: "INR" | "USD" = "INR") => ({ month: key, currency, payingMembers, cents, refunded });

  it("starts the query at the first of the month five months back, in India", () => {
    // 1 May 00:00 in India is 30 April 18:30 UTC.
    expect(monthsWindowStart(NOW, 6).toISOString()).toBe("2026-04-30T18:30:00.000Z");
  });

  it("reads a month by India's calendar: 19:00 UTC on 30 September is already October there", () => {
    expect(monthsWindowStart(new Date("2026-09-30T19:00:00.000Z"), 1).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("lists six months newest first, each with its own members and commission, and scales the bars to the best month", () => {
    const list = monthRows([month("2026-08", 1, 50_000), month("2026-09", 0, 0, 1), month("2026-10", 2, 200_000)], NOW, 6);
    expect(list?.rows.map((row) => [row.label, row.payingMembers, row.cents, row.refunded, row.widthPercent])).toEqual([
      ["Oct", 2, 200_000, 0, 100],
      ["Sep", 0, 0, 1, 0],
      ["Aug", 1, 50_000, 0, 25],
      ["Jul", 0, 0, 0, 0],
      ["Jun", 0, 0, 0, 0],
      ["May", 0, 0, 0, 0],
    ]);
    expect(list?.current.month).toBe("2026-10");
    expect(list?.currency).toBe("INR");
  });

  it("keeps a month nothing happened in as a row of zeros, and a refunded month as itself", () => {
    const list = monthRows([month("2026-09", 0, 0, 2)], NOW, 3);
    expect(list?.rows.map((row) => [row.label, row.payingMembers, row.refunded])).toEqual([["Oct", 0, 0], ["Sep", 0, 2], ["Aug", 0, 0]]);
  });

  it("crosses a year end, and lists the currency with the most earned", () => {
    const list = monthRows(
      [month("2026-12", 1, 10_000), month("2027-01", 3, 90_000, 0, "USD"), month("2027-01", 1, 1_000)],
      new Date("2027-01-10T10:00:00.000Z"),
      3,
    );
    expect(list?.currency).toBe("USD");
    expect(list?.rows.map((row) => row.month)).toEqual(["2027-01", "2026-12", "2026-11"]);
    expect(list?.current.payingMembers).toBe(3);
  });

  it("is null when nothing happened in the window", () => {
    expect(monthRows([], NOW, 6)).toBeNull();
  });
});

describe("payingLine", () => {
  it("says how many paid, and says so when none did", () => {
    expect(payingLine(0)).toBe("None paying");
    expect(payingLine(1)).toBe("1 paying");
    expect(payingLine(12)).toBe("12 paying");
  });
});
