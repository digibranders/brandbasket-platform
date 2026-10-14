import { describe, expect, it } from "vitest";
import { canRecordOutcome } from "./booking-actions";

const NOW = new Date("2026-09-28T10:00:00Z");

describe("canRecordOutcome", () => {
  it("is true for a booked appointment whose slot has already started", () => {
    expect(canRecordOutcome({ status: "booked", startsAt: new Date("2026-09-28T09:00:00Z") }, NOW)).toBe(true);
  });

  it("is true for a booked appointment starting exactly now", () => {
    expect(canRecordOutcome({ status: "booked", startsAt: NOW }, NOW)).toBe(true);
  });

  it("is false for a booked appointment whose slot hasn't started yet", () => {
    expect(canRecordOutcome({ status: "booked", startsAt: new Date("2026-09-28T11:00:00Z") }, NOW)).toBe(false);
  });

  it("is false for an appointment that isn't booked, even if its slot has started", () => {
    const started = new Date("2026-09-28T09:00:00Z");
    expect(canRecordOutcome({ status: "done", startsAt: started }, NOW)).toBe(false);
    expect(canRecordOutcome({ status: "no_show", startsAt: started }, NOW)).toBe(false);
    expect(canRecordOutcome({ status: "cancelled", startsAt: started }, NOW)).toBe(false);
  });
});
