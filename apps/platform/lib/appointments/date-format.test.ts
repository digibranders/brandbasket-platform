import { describe, expect, it } from "vitest";
import { formatBookedAt, formatGridDayLabel, formatLongDate, formatMonthTitle, formatRelativeTime, formatWeekRangeLabel } from "./date-format";

describe("formatGridDayLabel", () => {
  it("formats a weekday and day with no year", () => {
    expect(formatGridDayLabel("2026-09-28")).toBe("Mon 28");
  });

  it("formats a single-digit day with no leading zero", () => {
    expect(formatGridDayLabel("2026-10-04")).toBe("Sun 4");
  });

  it("throws for a malformed date", () => {
    expect(() => formatGridDayLabel("28-09-2026")).toThrow(RangeError);
  });
});

describe("formatWeekRangeLabel", () => {
  it("formats a week within one month", () => {
    expect(formatWeekRangeLabel("2026-09-21")).toBe("21 Sep – 27 Sep 2026");
  });

  it("formats a week spanning two months in the same year", () => {
    expect(formatWeekRangeLabel("2026-09-28")).toBe("28 Sep – 4 Oct 2026");
  });

  it("carries the year on both ends of a week spanning a year boundary", () => {
    expect(formatWeekRangeLabel("2026-12-28")).toBe("28 Dec 2026 – 3 Jan 2027");
  });
});

describe("formatLongDate", () => {
  it("formats a date in the current year without the year", () => {
    expect(formatLongDate("2026-09-28", 2026)).toBe("Monday 28 September");
  });

  it("appends the year for a date outside the current year", () => {
    expect(formatLongDate("2027-01-03", 2026)).toBe("Sunday 3 January 2027");
  });

  it("throws for a malformed date", () => {
    expect(() => formatLongDate("not-a-date", 2026)).toThrow(RangeError);
  });
});

describe("formatBookedAt", () => {
  it("formats an instant in the business's own time zone, 24-hour", () => {
    // 2026-09-28T09:35:00Z is 2026-09-28 15:05 in Asia/Kolkata (UTC+5:30).
    const instant = new Date("2026-09-28T09:35:00Z");
    expect(formatBookedAt(instant, "Asia/Kolkata", 2026)).toBe("Monday 28 September, 15:05");
  });

  it("appends the year when the local date falls outside currentYear", () => {
    // 2026-12-31T20:00:00Z is 2027-01-01 01:30 in Asia/Kolkata.
    const instant = new Date("2026-12-31T20:00:00Z");
    expect(formatBookedAt(instant, "Asia/Kolkata", 2026)).toBe("Friday 1 January 2027, 01:30");
  });

  it("falls back correctly for UTC", () => {
    const instant = new Date("2026-09-28T09:05:00Z");
    expect(formatBookedAt(instant, "UTC", 2026)).toBe("Monday 28 September, 09:05");
  });
});

describe("formatMonthTitle", () => {
  it("formats a month with its year", () => {
    expect(formatMonthTitle("2026-09")).toBe("September 2026");
  });

  it("formats January without off-by-one month drift", () => {
    expect(formatMonthTitle("2026-01")).toBe("January 2026");
  });

  it("throws for a malformed month", () => {
    expect(() => formatMonthTitle("2026-9")).toThrow(RangeError);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("reads as just now for anything under 45 seconds old", () => {
    expect(formatRelativeTime(new Date("2026-09-28T11:59:30Z"), now)).toBe("just now");
    expect(formatRelativeTime(now, now)).toBe("just now");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-09-28T11:55:00Z"), now)).toBe("5 minutes ago");
  });

  it("formats one hour ago as singular", () => {
    expect(formatRelativeTime(new Date("2026-09-28T11:00:00Z"), now)).toBe("1 hour ago");
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime(new Date("2026-09-28T10:00:00Z"), now)).toBe("2 hours ago");
  });

  it("formats yesterday using Intl's own idiom", () => {
    expect(formatRelativeTime(new Date("2026-09-27T12:00:00Z"), now)).toBe("yesterday");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime(new Date("2026-09-24T12:00:00Z"), now)).toBe("4 days ago");
  });

  it("formats a future instant as ahead rather than ago", () => {
    expect(formatRelativeTime(new Date("2026-09-28T14:00:00Z"), now)).toBe("in 2 hours");
  });
});
