import { describe, expect, it } from "vitest";
import { daysUntilDue, requestDeadlines, requestDeadlinesFor, requestUrgency } from "./privacy-request-deadlines";

const RECEIVED = new Date("2026-11-01T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number): Date => new Date(RECEIVED.getTime() + days * DAY);

describe("requestDeadlines", () => {
  it("is due 30 days after it was received, and the Act's ceiling is 90 days", () => {
    expect(requestDeadlines(RECEIVED)).toEqual({ dueAt: at(30), legalCeilingAt: at(90) });
  });
});

describe("requestUrgency", () => {
  const open = { receivedAt: RECEIVED, dueAt: at(30), closedAt: null };

  it("is on track until day 20, a reminder from day 20, urgent from day 25, overdue after day 30", () => {
    expect(requestUrgency(open, at(19.9))).toBe("on_track");
    expect(requestUrgency(open, at(20))).toBe("reminder");
    expect(requestUrgency(open, at(24.9))).toBe("reminder");
    expect(requestUrgency(open, at(25))).toBe("urgent");
    expect(requestUrgency(open, at(30))).toBe("urgent");
    expect(requestUrgency(open, new Date(at(30).getTime() + 1))).toBe("overdue");
  });

  it("scales the reminder points to a request with a shorter deadline", () => {
    const content = { receivedAt: RECEIVED, dueAt: at(7), closedAt: null };
    expect(requestUrgency(content, at(4))).toBe("on_track");
    expect(requestUrgency(content, at(5.5))).toBe("reminder");
    expect(requestUrgency(content, at(6.5))).toBe("urgent");
  });

  it("says whether a closed request was closed in time, whatever the date now", () => {
    expect(requestUrgency({ ...open, closedAt: at(30) }, at(200))).toBe("done_on_time");
    expect(requestUrgency({ ...open, closedAt: new Date(at(30).getTime() + 1) }, at(200))).toBe("done_late");
  });
});

describe("daysUntilDue", () => {
  it("counts whole days remaining, rounded up, and goes negative once past due", () => {
    expect(daysUntilDue(at(30), at(0))).toBe(30);
    expect(daysUntilDue(at(30), at(29.5))).toBe(1);
    expect(daysUntilDue(at(30), at(31))).toBe(-1);
  });
});

describe("requestDeadlinesFor", () => {
  const received = new Date("2026-11-01T06:00:00.000Z");

  it("gives a content report and a listing removal 15 days, the IT Rules limit, as both target and ceiling", () => {
    for (const kind of ["content_report", "listing_removal"]) {
      expect(requestDeadlinesFor(kind, received)).toEqual({ dueAt: new Date("2026-11-16T06:00:00.000Z"), legalCeilingAt: new Date("2026-11-16T06:00:00.000Z") });
    }
  });

  it("keeps every other kind on the 30-day target and 90-day ceiling", () => {
    expect(requestDeadlinesFor("grievance", received)).toEqual(requestDeadlines(received));
  });
});
