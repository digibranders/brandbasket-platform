import { describe, expect, it } from "vitest";
import { parseMonthlyReportArgs } from "./job-args";

const NOW = new Date("2026-11-01T21:30:00Z");

describe("parseMonthlyReportArgs", () => {
  it("defaults to the last full month in India", () => {
    expect(parseMonthlyReportArgs([], NOW)).toEqual({ month: "2026-10", dryRun: false });
  });

  it("reads each option", () => {
    const id = "01a1a146-5523-782c-b087-1f6325f90983";
    expect(parseMonthlyReportArgs(["--month", "2026-09", "--dry-run", "--business", id], NOW)).toEqual({ month: "2026-09", dryRun: true, businessId: id });
  });

  it("refuses a bad month, a bad id and an unknown option", () => {
    expect(() => parseMonthlyReportArgs(["--month", "2026-13"], NOW)).toThrow("--month");
    expect(() => parseMonthlyReportArgs(["--business", "x"], NOW)).toThrow("--business");
    expect(() => parseMonthlyReportArgs(["--send"], NOW)).toThrow("Unknown option");
  });
});
