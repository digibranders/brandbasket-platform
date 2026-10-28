import { describe, expect, it } from "vitest";
import { lastFullMonth, monthKeyOf, monthName, monthRange, nextMonthKey, parseMonthKey, previousMonthKey } from "./period";

describe("monthKeyOf", () => {
  it("names the calendar month in India, not in UTC", () => {
    // 19:00 UTC on 31 October is 00:30 on 1 November in India.
    expect(monthKeyOf(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11");
    expect(monthKeyOf(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10");
  });
});

describe("lastFullMonth", () => {
  it("is the month before the one the date falls in", () => {
    expect(lastFullMonth(new Date("2026-11-04T04:30:00Z"))).toBe("2026-10");
  });
  it("crosses the year", () => {
    expect(lastFullMonth(new Date("2027-01-02T10:00:00Z"))).toBe("2026-12");
  });
});

describe("previousMonthKey and nextMonthKey", () => {
  it("step one month and cross the year", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-10")).toBe("2026-09");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
    expect(nextMonthKey("2026-10")).toBe("2026-11");
  });
});

describe("monthRange", () => {
  it("gives the first and last day and the number of days", () => {
    expect(monthRange("2026-10")).toEqual({ key: "2026-10", start: "2026-10-01", end: "2026-10-31", days: 31, name: "October", year: 2026 });
  });
  it("knows February, leap years included", () => {
    expect(monthRange("2026-02").end).toBe("2026-02-28");
    expect(monthRange("2028-02")).toMatchObject({ end: "2028-02-29", days: 29 });
  });
});

describe("monthName", () => {
  it("is the English month name", () => {
    expect(monthName("2026-09")).toBe("September");
  });
});

describe("parseMonthKey", () => {
  it("accepts a real month and refuses the rest", () => {
    expect(parseMonthKey("2026-10")).toBe("2026-10");
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey("October")).toBeNull();
  });
});
