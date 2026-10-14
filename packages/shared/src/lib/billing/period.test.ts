import { describe, expect, it } from "vitest";
import { billingPeriodProgress, nextPaymentDate } from "./period";

const utc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("nextPaymentDate", () => {
  it("is the end of the paid-up-front term while that term runs", () => {
    expect(
      nextPaymentDate({ commitmentEndsAt: utc("2026-10-01"), paidThroughAt: utc("2026-10-01") }, utc("2026-09-11")),
    ).toEqual(utc("2026-10-01"));
  });

  it("is the paid-through date once the term is over", () => {
    expect(
      nextPaymentDate({ commitmentEndsAt: utc("2026-10-01"), paidThroughAt: utc("2026-11-01") }, utc("2026-10-16")),
    ).toEqual(utc("2026-11-01"));
  });

  it("is null when nothing has been paid through", () => {
    expect(nextPaymentDate({ commitmentEndsAt: null, paidThroughAt: null }, utc("2026-10-16"))).toBeNull();
  });
});

describe("billingPeriodProgress", () => {
  it("measures the first term from the day the plan started", () => {
    const progress = billingPeriodProgress(
      { activatedAt: utc("2026-09-01"), commitmentEndsAt: utc("2026-10-01"), paidThroughAt: utc("2026-10-01") },
      utc("2026-09-11"),
    );
    expect(progress).toEqual({ start: utc("2026-09-01"), end: utc("2026-10-01"), elapsedDays: 10, totalDays: 30 });
  });

  it("measures a later month from one calendar month before the paid-through date", () => {
    const progress = billingPeriodProgress(
      { activatedAt: utc("2026-09-01"), commitmentEndsAt: utc("2026-10-01"), paidThroughAt: utc("2026-11-01") },
      utc("2026-10-16"),
    );
    expect(progress).toEqual({ start: utc("2026-10-01"), end: utc("2026-11-01"), elapsedDays: 15, totalDays: 31 });
  });

  it("clamps the start to the end of a shorter month", () => {
    const progress = billingPeriodProgress(
      { activatedAt: utc("2026-01-31"), commitmentEndsAt: utc("2026-02-28"), paidThroughAt: utc("2026-03-31") },
      utc("2026-03-10"),
    );
    expect(progress?.start).toEqual(utc("2026-02-28"));
    expect(progress?.totalDays).toBe(31);
  });

  it("never starts before the plan did", () => {
    const progress = billingPeriodProgress(
      { activatedAt: utc("2026-10-20"), commitmentEndsAt: utc("2026-10-01"), paidThroughAt: utc("2026-11-01") },
      utc("2026-10-25"),
    );
    expect(progress?.start).toEqual(utc("2026-10-20"));
    expect(progress?.elapsedDays).toBe(5);
    expect(progress?.totalDays).toBe(12);
  });

  it("keeps the elapsed days between zero and the whole period", () => {
    const subscription = {
      activatedAt: utc("2026-09-01"),
      commitmentEndsAt: utc("2026-10-01"),
      paidThroughAt: utc("2026-10-01"),
    };
    expect(billingPeriodProgress(subscription, utc("2026-08-01"))?.elapsedDays).toBe(0);
    expect(billingPeriodProgress(subscription, utc("2026-12-01"))?.elapsedDays).toBe(30);
  });

  it("is null before the plan has started or when nothing is paid through", () => {
    expect(
      billingPeriodProgress(
        { activatedAt: null, commitmentEndsAt: null, paidThroughAt: null },
        utc("2026-09-11"),
      ),
    ).toBeNull();
    expect(
      billingPeriodProgress(
        { activatedAt: utc("2026-09-01"), commitmentEndsAt: null, paidThroughAt: null },
        utc("2026-09-11"),
      ),
    ).toBeNull();
  });
});
