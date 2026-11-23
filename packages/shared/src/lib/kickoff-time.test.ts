import { describe, expect, it } from "vitest";
import { kickoffClockTime, kickoffDayTime } from "./kickoff-time";

const STARTS = new Date("2026-11-17T09:00:00.000Z");

describe("kickoff times in notices", () => {
  it("says the day and the time in India time, labelled", () => {
    expect(kickoffDayTime(STARTS)).toBe("Tue 17 Nov, 2:30 pm IST");
  });

  it("says only the time for a call starting within the hour", () => {
    expect(kickoffClockTime(STARTS)).toBe("2:30 pm IST");
  });
});
