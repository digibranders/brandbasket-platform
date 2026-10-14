import { describe, expect, it } from "vitest";
import { groupByDate, isIsoMonth, monthRange, serialNumbersById, shiftMonth } from "./view-ranges";

describe("isIsoMonth", () => {
  it("accepts a real month", () => {
    expect(isIsoMonth("2026-09")).toBe(true);
  });

  it("accepts the edges of the month range", () => {
    expect(isIsoMonth("2026-01")).toBe(true);
    expect(isIsoMonth("2026-12")).toBe(true);
  });

  it("rejects month 00 and month 13", () => {
    expect(isIsoMonth("2026-00")).toBe(false);
    expect(isIsoMonth("2026-13")).toBe(false);
  });

  it("rejects a year outside 2000-2100", () => {
    expect(isIsoMonth("1999-09")).toBe(false);
    expect(isIsoMonth("2101-09")).toBe(false);
  });

  it("rejects a malformed value", () => {
    expect(isIsoMonth("2026-9")).toBe(false);
    expect(isIsoMonth("2026/09")).toBe(false);
    expect(isIsoMonth("not-a-month")).toBe(false);
  });
});

describe("monthRange", () => {
  it("gives a 30-day month's first and last day", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("gives a 31-day month's first and last day", () => {
    expect(monthRange("2026-01")).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("gives February its 28 days in a common year", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("gives February its 29 days in a leap year", () => {
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("shiftMonth", () => {
  it("steps forward within a year", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });

  it("steps backward within a year", () => {
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("carries into the next year", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("carries into the previous year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("supports a multi-month shift", () => {
    expect(shiftMonth("2026-01", 13)).toBe("2027-02");
  });
});

describe("groupByDate", () => {
  it("splits an ordered list into runs by date", () => {
    const rows = [
      { id: "a", localDate: "2026-09-01" },
      { id: "b", localDate: "2026-09-01" },
      { id: "c", localDate: "2026-09-03" },
    ];
    expect(groupByDate(rows)).toEqual([
      { date: "2026-09-01", rows: [rows[0], rows[1]] },
      { date: "2026-09-03", rows: [rows[2]] },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(groupByDate([])).toEqual([]);
  });

  it("does not merge the same date if it isn't adjacent", () => {
    const rows = [
      { id: "a", localDate: "2026-09-01" },
      { id: "b", localDate: "2026-09-02" },
      { id: "c", localDate: "2026-09-01" },
    ];
    expect(groupByDate(rows)).toEqual([
      { date: "2026-09-01", rows: [rows[0]] },
      { date: "2026-09-02", rows: [rows[1]] },
      { date: "2026-09-01", rows: [rows[2]] },
    ]);
  });
});

describe("serialNumbersById", () => {
  it("numbers rows 1..length in the order given", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(serialNumbersById(rows)).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]),
    );
  });

  it("stays continuous across what would be separate date groups, not restarting per date", () => {
    // Same shape groupByDate would split into three groups (2026-09-01, 2026-09-02, 2026-09-01 again) -- the
    // numbering here doesn't know or care about that split.
    const rows = [
      { id: "a", localDate: "2026-09-01" },
      { id: "b", localDate: "2026-09-01" },
      { id: "c", localDate: "2026-09-02" },
      { id: "d", localDate: "2026-09-01" },
    ];
    expect(serialNumbersById(rows)).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
        ["d", 4],
      ]),
    );
  });

  it("includes every row regardless of status, e.g. a cancelled one", () => {
    const rows = [
      { id: "a", status: "booked" },
      { id: "b", status: "cancelled" },
      { id: "c", status: "done" },
    ];
    expect(serialNumbersById(rows)).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]),
    );
  });

  it("returns an empty map for no rows", () => {
    expect(serialNumbersById([])).toEqual(new Map());
  });
});
