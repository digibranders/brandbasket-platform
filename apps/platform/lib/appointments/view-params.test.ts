import { describe, expect, it } from "vitest";
import { CUSTOM_RANGE_ORDER_MESSAGE, CUSTOM_RANGE_TOO_LONG_MESSAGE, parseAppointmentsViewParams } from "./view-params";

const TODAY = "2026-09-28"; // a Monday

describe("parseAppointmentsViewParams: view selection", () => {
  it("defaults to week when no view is given", () => {
    expect(parseAppointmentsViewParams({}, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });

  it("falls back to week for an unrecognised view", () => {
    expect(parseAppointmentsViewParams({ view: "yesterday" }, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });

  it("reads each of the four views", () => {
    expect(parseAppointmentsViewParams({ view: "today" }, TODAY).view).toBe("today");
    expect(parseAppointmentsViewParams({ view: "week" }, TODAY).view).toBe("week");
    expect(parseAppointmentsViewParams({ view: "month" }, TODAY).view).toBe("month");
    expect(parseAppointmentsViewParams({ view: "custom" }, TODAY).view).toBe("custom");
  });

  it("treats a repeated param (string[]) the same as a missing one", () => {
    expect(parseAppointmentsViewParams({ view: ["today", "week"] }, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });
});

describe("parseAppointmentsViewParams: today", () => {
  it("defaults day to today", () => {
    expect(parseAppointmentsViewParams({ view: "today" }, TODAY)).toEqual({ view: "today", day: "2026-09-28" });
  });

  it("reads a valid day", () => {
    expect(parseAppointmentsViewParams({ view: "today", day: "2026-09-15" }, TODAY)).toEqual({ view: "today", day: "2026-09-15" });
  });

  it("falls back to today for a malformed day", () => {
    expect(parseAppointmentsViewParams({ view: "today", day: "not-a-date" }, TODAY)).toEqual({ view: "today", day: "2026-09-28" });
  });
});

describe("parseAppointmentsViewParams: week", () => {
  it("defaults week to the Monday of today's week", () => {
    expect(parseAppointmentsViewParams({}, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });

  it("normalises any day in the target week to its Monday", () => {
    expect(parseAppointmentsViewParams({ week: "2026-09-30" }, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });

  it("falls back to the current week for a malformed week", () => {
    expect(parseAppointmentsViewParams({ week: "nope" }, TODAY)).toEqual({ view: "week", week: "2026-09-28" });
  });
});

describe("parseAppointmentsViewParams: month", () => {
  it("defaults month to the current month", () => {
    expect(parseAppointmentsViewParams({ view: "month" }, TODAY)).toEqual({ view: "month", month: "2026-09" });
  });

  it("reads a valid month", () => {
    expect(parseAppointmentsViewParams({ view: "month", month: "2026-01" }, TODAY)).toEqual({ view: "month", month: "2026-01" });
  });

  it("falls back to the current month for a malformed month", () => {
    expect(parseAppointmentsViewParams({ view: "month", month: "2026-13" }, TODAY)).toEqual({ view: "month", month: "2026-09" });
  });
});

describe("parseAppointmentsViewParams: custom", () => {
  it("defaults from and to to today, with no range error", () => {
    expect(parseAppointmentsViewParams({ view: "custom" }, TODAY)).toEqual({ view: "custom", from: "2026-09-28", to: "2026-09-28", rangeError: null });
  });

  it("reads a valid range", () => {
    expect(parseAppointmentsViewParams({ view: "custom", from: "2026-01-01", to: "2026-01-31" }, TODAY)).toEqual({
      view: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
      rangeError: null,
    });
  });

  it("falls back each malformed side independently", () => {
    expect(parseAppointmentsViewParams({ view: "custom", from: "nope", to: "2026-01-31" }, TODAY)).toEqual({
      view: "custom",
      from: "2026-09-28",
      to: "2026-01-31",
      rangeError: CUSTOM_RANGE_ORDER_MESSAGE, // to before the fallback from -- see the order check below
    });
  });

  it("flags a range whose end is before its start, echoing both dates", () => {
    expect(parseAppointmentsViewParams({ view: "custom", from: "2026-09-10", to: "2026-09-01" }, TODAY)).toEqual({
      view: "custom",
      from: "2026-09-10",
      to: "2026-09-01",
      rangeError: CUSTOM_RANGE_ORDER_MESSAGE,
    });
  });

  it("accepts a range of exactly 366 days", () => {
    const result = parseAppointmentsViewParams({ view: "custom", from: "2026-01-01", to: "2027-01-01" }, TODAY);
    expect(result).toEqual({ view: "custom", from: "2026-01-01", to: "2027-01-01", rangeError: null });
  });

  it("flags a range of 367 days as too long", () => {
    const result = parseAppointmentsViewParams({ view: "custom", from: "2026-01-01", to: "2027-01-02" }, TODAY);
    expect(result).toEqual({ view: "custom", from: "2026-01-01", to: "2027-01-02", rangeError: CUSTOM_RANGE_TOO_LONG_MESSAGE });
  });

  it("accepts a single-day range (from equals to)", () => {
    expect(parseAppointmentsViewParams({ view: "custom", from: "2026-09-15", to: "2026-09-15" }, TODAY)).toEqual({
      view: "custom",
      from: "2026-09-15",
      to: "2026-09-15",
      rangeError: null,
    });
  });
});
