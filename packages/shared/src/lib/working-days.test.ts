import { describe, expect, it } from "vitest";
import { addWorkingDays, REVISION_READY_WORKING_DAYS, revisionReadyDay, workingDayOf } from "./working-days";

describe("addWorkingDays", () => {
  it("skips Saturday and Sunday", () => {
    expect(addWorkingDays("2026-10-30", 1)).toBe("2026-11-02");
    expect(addWorkingDays("2026-10-30", 7)).toBe("2026-11-10");
  });

  it("returns the same day for zero", () => {
    expect(addWorkingDays("2026-11-01", 0)).toBe("2026-11-01");
  });
});

describe("revisionReadyDay", () => {
  it("is two working days after the day the changes were asked for", () => {
    expect(REVISION_READY_WORKING_DAYS).toBe(2);
    expect(revisionReadyDay("2026-11-03")).toBe("2026-11-05");
    expect(revisionReadyDay("2026-10-30")).toBe("2026-11-03");
  });
});

describe("workingDayOf", () => {
  it("reads the day in India, not UTC", () => {
    expect(workingDayOf(new Date("2026-11-02T20:00:00Z"))).toBe("2026-11-03");
    expect(workingDayOf(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-02");
  });
});
