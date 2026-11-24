import type { ClientBilling } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { moneyNeedsALookCount, renewalLane, renewalState } from "./money-attention";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const day = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

function client(id: string, billing: ClientBilling): { businessId: string; businessName: string; billing: ClientBilling } {
  return { businessId: id, businessName: `Client ${id}`, billing };
}

const first = { amountCents: 299900, currency: "INR", provider: "razorpay", paidAt: day(40), manual: null } as const;
const sub = (status: "active" | "past_due" | "cancelled", paidThroughAt: Date | null): NonNullable<ClientBilling["subscription"]> => ({
  status,
  provider: "razorpay",
  billingInterval: "month",
  activatedAt: day(40),
  paidThroughAt,
  commitmentEndsAt: null,
});

describe("renewalState", () => {
  it("is past due while the provider retries a failed renewal", () => {
    expect(renewalState(client("a", { subscription: sub("past_due", day(3)), firstPayment: first }), NOW)).toBe("past_due");
  });

  it("is lapsed when the paid period has run out", () => {
    expect(renewalState(client("a", { subscription: sub("cancelled", day(12)), firstPayment: first }), NOW)).toBe("lapsed");
  });

  it("is nothing for a plan inside its paid period or one that never paid", () => {
    expect(renewalState(client("a", { subscription: sub("active", day(-5)), firstPayment: first }), NOW)).toBeNull();
    expect(renewalState(client("b", { subscription: null, firstPayment: null }), NOW)).toBeNull();
  });
});

describe("renewalLane", () => {
  const clients = [
    client("a", { subscription: sub("past_due", day(3)), firstPayment: first }),
    client("b", { subscription: sub("cancelled", day(12)), firstPayment: first }),
    client("c", { subscription: sub("active", day(-1)), firstPayment: first }),
  ];

  it("lists past due and lapsed plans with the longest overdue first", () => {
    const lane = renewalLane(clients, NOW);
    expect(lane.map((row) => [row.businessId, row.state, row.daysOverdue])).toEqual([
      ["b", "lapsed", 12],
      ["a", "past_due", 3],
    ]);
    expect(lane[0]?.href).toBe("/clients/b/billing");
  });

  it("counts a missing date as not known and sorts it last", () => {
    const lane = renewalLane([client("x", { subscription: sub("past_due", null), firstPayment: first }), ...clients], NOW);
    expect(lane.at(-1)).toMatchObject({ businessId: "x", daysOverdue: null });
  });
});

describe("moneyNeedsALookCount", () => {
  it("adds payments and renewals, so a failed renewal is never All clear", () => {
    expect(moneyNeedsALookCount({ payments: 2, renewals: 2 })).toBe(4);
    expect(moneyNeedsALookCount({ payments: 0, renewals: 1 })).toBe(1);
  });
});
