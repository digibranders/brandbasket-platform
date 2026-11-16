import { describe, expect, it } from "vitest";
import { breachClock, requestClock } from "./deadline-clock";

const NOW = new Date("2026-11-16T10:00:00.000Z");
const after = (ms: number): Date => new Date(NOW.getTime() + ms);
const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 24 * HOUR;

describe("requestClock (days and hours, for the 30 day privacy clock)", () => {
  it("counts down in padded days and hours", () => {
    expect(requestClock(after(17 * DAY + 8 * HOUR), NOW)).toEqual({ text: "17d 08h remaining", late: false });
    expect(requestClock(after(3 * DAY + 14 * HOUR + 59 * MIN), NOW)).toEqual({ text: "03d 14h remaining", late: false });
  });

  it("counts up once it is past due, and marks it late", () => {
    expect(requestClock(after(-(2 * DAY + 4 * HOUR)), NOW)).toEqual({ text: "02d 04h overdue", late: true });
  });
});

describe("breachClock (hours and minutes, for the 6 and 72 hour clocks)", () => {
  it("counts down in hours and minutes", () => {
    expect(breachClock(after(5 * HOUR + 12 * MIN), NOW)).toEqual({ text: "5h 12m left", late: false });
    expect(breachClock(after(71 * HOUR + 5 * MIN), NOW)).toEqual({ text: "71h 05m left", late: false });
  });

  it("marks a missed deadline late, with how long ago", () => {
    expect(breachClock(after(-(1 * HOUR + 5 * MIN)), NOW)).toEqual({ text: "1h 05m overdue", late: true });
  });

  it("is overdue, not zero, at the exact deadline", () => {
    expect(breachClock(NOW, NOW)).toEqual({ text: "0h 00m overdue", late: true });
  });
});
