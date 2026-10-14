import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatDueDate, formatStepNumber, formatStoredDate, formatTimestamp } from "./format";

describe("formatDueDate", () => {
  it("gives the day, date and time", () => {
    expect(formatDueDate(new Date("2026-09-18T09:30:00Z"), "UTC")).toBe("Friday 18 September at 9:30 am");
  });

  it("reads the same moment in the reader's zone", () => {
    expect(formatDueDate(new Date("2026-09-18T09:30:00Z"), "Asia/Kolkata")).toBe("Friday 18 September at 3:00 pm");
  });

  it("refuses an invalid date", () => {
    expect(() => formatDueDate(new Date("not a date"), "UTC")).toThrow(RangeError);
  });
});

describe("formatCalendarDate", () => {
  it("gives the day, month and year", () => {
    expect(formatCalendarDate(new Date("2026-12-16T10:00:00Z"), "UTC")).toBe("16 December 2026");
  });

  it("reads the date in the reader's zone, which can be a different day", () => {
    expect(formatCalendarDate(new Date("2026-12-16T20:00:00Z"), "Asia/Kolkata")).toBe("17 December 2026");
  });

  it("refuses an invalid date", () => {
    expect(() => formatCalendarDate(new Date("not a date"), "UTC")).toThrow(RangeError);
  });
});

describe("formatTimestamp", () => {
  it("gives the date with its year and the time", () => {
    expect(formatTimestamp(new Date("2026-09-16T09:30:00Z"), "UTC")).toBe("16 Sept 2026, 9:30 am");
    expect(formatTimestamp(new Date("2026-09-16T20:00:00Z"), "Asia/Kolkata")).toBe("17 Sept 2026, 1:30 am");
  });

  it("refuses an invalid date", () => {
    expect(() => formatTimestamp(new Date("not a date"), "UTC")).toThrow(RangeError);
  });
});

describe("formatStoredDate", () => {
  it("shows the date exactly as stored", () => {
    expect(formatStoredDate("2026-09-15")).toBe("15 September 2026");
  });

  it.each(["2026-02-30", "15/09/2026", ""])("refuses %j", (value) => {
    expect(() => formatStoredDate(value)).toThrow(RangeError);
  });
});

describe("formatStepNumber", () => {
  it("pads to two digits", () => {
    expect(formatStepNumber(0)).toBe("01");
    expect(formatStepNumber(11)).toBe("12");
  });
});
