import { describe, expect, it } from "vitest";
import { joinTime, monthGrid, monthOf, monthTitle, shiftMonth, splitTime } from "./month-grid";

describe("monthGrid", () => {
  it("lays a month out in whole weeks starting on Monday, with the days either side marked", () => {
    const grid = monthGrid("2026-12");
    // 1 December 2026 is a Tuesday: the grid starts on Monday 30 November.
    expect(grid[0]).toEqual({ day: "2026-11-30", inMonth: false });
    expect(grid[1]).toEqual({ day: "2026-12-01", inMonth: true });
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect((grid.at(-1)?.day ?? "") >= "2026-12-31").toBe(true);
  });

  it("starts on the first when the month begins on a Monday, and keeps February at four weeks when it fits", () => {
    expect(monthGrid("2026-06")[0]).toEqual({ day: "2026-06-01", inMonth: true });
    // February 2027 starts on a Monday and has 28 days.
    expect(monthGrid("2027-02")).toHaveLength(28);
  });
});

describe("month helpers", () => {
  it("moves between months across a year end and names them", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-03", -14)).toBe("2025-01");
    expect(monthOf("2026-12-01")).toBe("2026-12");
    expect(monthTitle("2026-12")).toBe("December 2026");
  });

  it("converts a time to 12-hour parts and back, midnight and noon included", () => {
    expect(splitTime("00:05")).toEqual({ hour: 12, minute: 5, pm: false });
    expect(splitTime("12:30")).toEqual({ hour: 12, minute: 30, pm: true });
    expect(splitTime("16:45")).toEqual({ hour: 4, minute: 45, pm: true });
    for (const time of ["00:00", "00:05", "09:15", "12:00", "12:30", "16:45", "23:55"]) expect(joinTime(splitTime(time))).toBe(time);
  });
});
