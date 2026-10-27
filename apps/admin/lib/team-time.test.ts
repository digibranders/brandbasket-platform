import { describe, expect, it } from "vitest";
import { clock, greeting, isSameTeamDay, longDay, monthRange, shortDate, todayRange, weekdayDate } from "./team-time";

// 09:00 on Monday 30 November 2026 in India.
const MORNING = new Date("2026-11-30T03:30:00.000Z");

describe("greeting", () => {
  it("follows the hour in India", () => {
    expect(greeting(MORNING)).toBe("Good morning");
    expect(greeting(new Date("2026-11-30T08:00:00.000Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-11-30T13:00:00.000Z"))).toBe("Good evening");
  });
});

describe("labels", () => {
  it("writes days, dates and clocks in India's time", () => {
    expect(longDay(MORNING)).toBe("Monday 30 November");
    expect(shortDate(MORNING)).toBe("30 Nov");
    expect(clock(MORNING)).toBe("09:00");
  });
});

describe("todayRange", () => {
  it("runs from midnight to midnight in India", () => {
    expect(todayRange(MORNING)).toEqual({ start: new Date("2026-11-29T18:30:00.000Z"), end: new Date("2026-11-30T18:30:00.000Z") });
  });

  it("puts 00:30 in India on the new day", () => {
    expect(todayRange(new Date("2026-11-29T19:00:00.000Z")).start).toEqual(new Date("2026-11-29T18:30:00.000Z"));
  });
});

describe("monthRange", () => {
  it("runs from the first of the month to the first of the next, in India", () => {
    expect(monthRange(MORNING)).toEqual({ start: new Date("2026-10-31T18:30:00.000Z"), end: new Date("2026-11-30T18:30:00.000Z") });
  });

  it("rolls December into January", () => {
    expect(monthRange(new Date("2026-12-15T06:00:00.000Z")).end).toEqual(new Date("2026-12-31T18:30:00.000Z"));
  });
});

describe("weekdayDate", () => {
  it("writes a short weekday and date in India's time", () => {
    expect(weekdayDate(new Date("2026-12-01T08:30:00.000Z"))).toBe("Tue 1 Dec");
  });
});

describe("isSameTeamDay", () => {
  it("tells whether two moments fall on the same India day", () => {
    expect(isSameTeamDay(new Date("2026-11-30T06:00:00.000Z"), new Date("2026-11-30T17:00:00.000Z"))).toBe(true);
    expect(isSameTeamDay(new Date("2026-11-30T06:00:00.000Z"), new Date("2026-11-30T19:00:00.000Z"))).toBe(false);
  });
});

