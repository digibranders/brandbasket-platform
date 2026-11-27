import type { Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyEvent: vi.fn(async () => undefined),
  sendFirstChargeReminder: vi.fn(async () => undefined),
  sendBalanceDue: vi.fn(async () => undefined),
  listAwaiting: vi.fn(),
  listEnding: vi.fn(),
  listPaidThrough: vi.fn(),
  latest: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("./notify-event", () => ({ notifyEvent: mocks.notifyEvent }));
vi.mock("./payment-emails", () => ({ sendFirstChargeReminder: mocks.sendFirstChargeReminder, sendBalanceDue: mocks.sendBalanceDue }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  listSubscriptionsEndingFirstTerm: mocks.listEnding,
  listSubscriptionsPaidThroughBetween: mocks.listPaidThrough,
  listDealsAwaitingBalance: mocks.listAwaiting,
  findLatestSubscriptionForBusiness: mocks.latest,
  findPlanById: mocks.plan,
}));

import { sendDueBillingNotices } from "./billing-notices";

const DB = {} as Database;
const NOW = new Date("2026-11-20T06:00:00.000Z");
const deps = { send: vi.fn(), dashboardOrigin: "https://app.example.test" };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    businessId: "b1",
    planId: "plan1",
    provider: "razorpay",
    status: "active",
    cancelRequestedAt: null,
    activatedAt: new Date("2026-10-20T00:00:00Z"),
    commitmentEndsAt: new Date("2026-11-22T00:00:00Z"),
    paidThroughAt: new Date("2026-11-22T00:00:00Z"),
    discountAmountCents: 0,
    nextDiscountAmountCents: null,
    bundledAddOnNetCents: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEnding.mockResolvedValue([]);
  mocks.listPaidThrough.mockResolvedValue([]);
  mocks.listAwaiting.mockResolvedValue([]);
  mocks.latest.mockResolvedValue({ id: "s1" });
  mocks.plan.mockResolvedValue({ recurringAmountCents: 299_900, currency: "INR" });
});

describe("the first charge reminder sweep", () => {
  it("sends the reminder for a subscription whose first term ends within 3 days", async () => {
    mocks.listEnding.mockResolvedValue([subscription()]);
    const report = await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.listEnding).toHaveBeenCalledWith(DB, { from: NOW, to: new Date("2026-11-23T06:00:00.000Z") });
    expect(mocks.sendFirstChargeReminder).toHaveBeenCalledTimes(1);
    expect(mocks.sendFirstChargeReminder).toHaveBeenCalledWith(DB, deps, { businessId: "b1", amountCents: 299_900, currency: "INR", chargeDate: new Date("2026-11-22T00:00:00Z") }, NOW);
    expect(report).toEqual({ reminders: 1, lapses: 0, failed: 0 });
  });

  it("skips a subscription that is ending or has been replaced", async () => {
    mocks.listEnding.mockResolvedValue([subscription({ cancelRequestedAt: new Date("2026-11-01T00:00:00Z") }), subscription({ id: "s2" })]);
    mocks.latest.mockResolvedValue({ id: "s-newer" });
    await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.sendFirstChargeReminder).not.toHaveBeenCalled();
  });

  it("counts a failure and goes on to the next subscription", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listEnding.mockResolvedValue([subscription({ id: "s1" }), subscription({ id: "s3", businessId: "b3" })]);
    mocks.latest.mockImplementation(async (_db: unknown, businessId: string) => (businessId === "b1" ? Promise.reject(new Error("db")) : { id: "s3" }));
    const report = await sendDueBillingNotices(DB, deps, NOW);
    expect(report).toEqual({ reminders: 1, lapses: 0, failed: 1 });
  });
});

describe("the plan lapsed sweep", () => {
  const lapsed = () => subscription({ commitmentEndsAt: null, paidThroughAt: new Date("2026-11-15T00:00:00Z") });

  it("notifies once per subscription and paid-through date for a plan whose access ran out", async () => {
    mocks.listPaidThrough.mockResolvedValue([lapsed()]);
    const report = await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEvent).toHaveBeenCalledWith(DB, { event: "billing.plan_lapsed", audience: { kind: "customer", businessId: "b1" }, dedupeKey: "s1:2026-11-15T00:00:00.000Z", data: {} });
    expect(report.lapses).toBe(1);
  });

  it("says nothing while the plan still has access", async () => {
    mocks.listPaidThrough.mockResolvedValue([subscription({ paidThroughAt: new Date("2026-11-21T00:00:00Z") })]);
    await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.notifyEvent).not.toHaveBeenCalled();
  });

  it("says nothing when a newer subscription (a reactivation) has replaced it", async () => {
    mocks.listPaidThrough.mockResolvedValue([lapsed()]);
    mocks.latest.mockResolvedValue({ id: "s-newer" });
    await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.notifyEvent).not.toHaveBeenCalled();
  });

  it("looks back 14 days only", async () => {
    await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.listPaidThrough).toHaveBeenCalledWith(DB, { from: new Date("2026-11-06T06:00:00.000Z"), to: NOW });
  });
});

describe("the balance reminder sweep (plan 66)", () => {
  const deal = (readyAt: string) => ({ linkId: "l1", businessId: "b1", readyAt: new Date(readyAt), currency: "INR", balanceCents: 500_000 });

  it("reminds a deal whose website has been ready for three days, as a reminder", async () => {
    mocks.listAwaiting.mockResolvedValue([deal("2026-11-17T06:00:00.000Z")]);
    const report = await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.sendBalanceDue).toHaveBeenCalledWith(DB, deps, expect.objectContaining({ linkId: "l1", businessId: "b1", balanceCents: 500_000, reminder: true }), NOW);
    expect(report).toEqual({ reminders: 1, lapses: 0, failed: 0 });
  });

  it("leaves a deal marked ready less than three days ago to the first notice", async () => {
    mocks.listAwaiting.mockResolvedValue([deal("2026-11-18T06:00:00.000Z")]);
    await sendDueBillingNotices(DB, deps, NOW);
    expect(mocks.sendBalanceDue).not.toHaveBeenCalled();
  });

  it("counts a failed reminder and goes on", async () => {
    mocks.listAwaiting.mockResolvedValue([deal("2026-11-10T06:00:00.000Z"), { ...deal("2026-11-10T06:00:00.000Z"), linkId: "l2" }]);
    mocks.sendBalanceDue.mockRejectedValueOnce(new Error("boom"));
    const report = await sendDueBillingNotices(DB, deps, NOW);
    expect(report).toEqual({ reminders: 1, lapses: 0, failed: 1 });
  });
});
