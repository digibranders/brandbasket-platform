import { describe, expect, it } from "vitest";
import { parseReportRange, REPORT_RANGE_KEYS } from "./report-range";

describe("parseReportRange", () => {
  it("defaults to this month when the range is missing", () => {
    expect(parseReportRange(undefined, "2026-09-29")).toEqual({ key: "month", from: "2026-09-01", to: "2026-09-29", label: "This month" });
  });

  it("falls back to this month for an unknown or repeated range", () => {
    expect(parseReportRange("week", "2026-09-29").key).toBe("month");
    expect(parseReportRange("", "2026-09-29").key).toBe("month");
    expect(parseReportRange(["year", "month"], "2026-09-29").key).toBe("month");
  });

  it("reads this month from the first to today, including on the first itself", () => {
    expect(parseReportRange("month", "2026-09-29")).toMatchObject({ from: "2026-09-01", to: "2026-09-29" });
    expect(parseReportRange("month", "2026-03-01")).toMatchObject({ from: "2026-03-01", to: "2026-03-01" });
  });

  it("reads the last 3 months as this month and the two before it", () => {
    expect(parseReportRange("quarter", "2026-09-29")).toEqual({
      key: "quarter",
      from: "2026-07-01",
      to: "2026-09-29",
      label: "Last 3 months",
    });
  });

  it("carries the last 3 months back across a year boundary", () => {
    expect(parseReportRange("quarter", "2026-01-15")).toMatchObject({ from: "2025-11-01", to: "2026-01-15" });
    expect(parseReportRange("quarter", "2026-02-28")).toMatchObject({ from: "2025-12-01", to: "2026-02-28" });
    expect(parseReportRange("quarter", "2026-03-31")).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("reads this year from January 1st, including on new year's day and new year's eve", () => {
    expect(parseReportRange("year", "2026-09-29")).toEqual({ key: "year", from: "2026-01-01", to: "2026-09-29", label: "This year" });
    expect(parseReportRange("year", "2027-01-01")).toMatchObject({ from: "2027-01-01", to: "2027-01-01" });
    expect(parseReportRange("year", "2026-12-31")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("handles a leap day", () => {
    expect(parseReportRange("month", "2028-02-29")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
    expect(parseReportRange("quarter", "2028-02-29")).toMatchObject({ from: "2027-12-01" });
  });

  it("never starts after it ends", () => {
    for (const key of REPORT_RANGE_KEYS) {
      const range = parseReportRange(key, "2026-01-01");
      expect(range.from <= range.to).toBe(true);
    }
  });

  it("refuses a today that is not a date", () => {
    expect(() => parseReportRange("month", "2026-13-01")).toThrow(RangeError);
  });
});
