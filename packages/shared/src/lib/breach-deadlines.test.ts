import { describe, expect, it } from "vitest";
import { breachDeadlines, breachDutyState, CERT_IN_HOURS, BOARD_REPORT_HOURS } from "./breach-deadlines";

const FOUND = new Date("2026-10-12T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("breachDeadlines", () => {
  it("gives CERT-In six hours and the Board's detailed report 72 hours from when the breach was found", () => {
    expect(CERT_IN_HOURS).toBe(6);
    expect(BOARD_REPORT_HOURS).toBe(72);
    expect(breachDeadlines(FOUND)).toEqual({
      certInBy: new Date("2026-10-12T14:00:00.000Z"),
      boardReportBy: new Date("2026-10-15T08:00:00.000Z"),
    });
  });
});

describe("breachDutyState", () => {
  const deadline = new Date(FOUND.getTime() + 6 * HOUR);

  it("is done on time when reported by the deadline, and done late when reported after it", () => {
    expect(breachDutyState(new Date(FOUND.getTime() + 5 * HOUR), deadline, new Date(FOUND.getTime() + 10 * HOUR))).toBe("done_on_time");
    expect(breachDutyState(new Date(FOUND.getTime() + 7 * HOUR), deadline, new Date(FOUND.getTime() + 10 * HOUR))).toBe("done_late");
    expect(breachDutyState(deadline, deadline, new Date(FOUND.getTime() + 10 * HOUR))).toBe("done_on_time");
  });

  it("is due while the deadline has not passed, and overdue once it has with nothing reported", () => {
    expect(breachDutyState(null, deadline, new Date(FOUND.getTime() + 1 * HOUR))).toBe("due");
    expect(breachDutyState(null, deadline, new Date(FOUND.getTime() + 6 * HOUR))).toBe("due");
    expect(breachDutyState(null, deadline, new Date(FOUND.getTime() + 6 * HOUR + 1))).toBe("overdue");
  });

  it("has no deadline for the people affected: they are told without delay, so it is only done or not yet done", () => {
    expect(breachDutyState(null, null, FOUND)).toBe("due_without_delay");
    expect(breachDutyState(new Date(FOUND.getTime() + 20 * HOUR), null, FOUND)).toBe("done");
  });
});
