import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  approvedDueAt,
  REVISION_READY_WORKING_DAYS,
  revisionDueAt,
  revisionReadyDay,
  workingDayOf,
  workingDaysAfter,
} from "./working-days";

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

describe("workingDaysAfter", () => {
  it("adds working days skipping weekends and preserving time", () => {
    const monday = new Date("2026-11-02T10:00:00.000Z");
    expect(workingDaysAfter(monday, 1).toISOString()).toBe("2026-11-03T10:00:00.000Z");
    expect(workingDaysAfter(monday, 2).toISOString()).toBe("2026-11-04T10:00:00.000Z");

    const friday = new Date("2026-10-30T10:00:00.000Z");
    expect(workingDaysAfter(friday, 1).toISOString()).toBe("2026-11-02T10:00:00.000Z");
    expect(workingDaysAfter(friday, 2).toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });
});

describe("revisionDueAt", () => {
  it("sets the due date to two working days after the request", () => {
    const monday = new Date("2026-11-02T10:00:00.000Z");
    expect(revisionDueAt(monday).toISOString()).toBe("2026-11-04T10:00:00.000Z");

    const friday = new Date("2026-10-30T10:00:00.000Z");
    expect(revisionDueAt(friday).toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });
});

describe("approvedDueAt", () => {
  it("sets the due date to one working day after approval", () => {
    const monday = new Date("2026-11-02T10:00:00.000Z");
    expect(approvedDueAt(monday).toISOString()).toBe("2026-11-03T10:00:00.000Z");

    const friday = new Date("2026-10-30T10:00:00.000Z");
    expect(approvedDueAt(friday).toISOString()).toBe("2026-11-02T10:00:00.000Z");
  });
});

