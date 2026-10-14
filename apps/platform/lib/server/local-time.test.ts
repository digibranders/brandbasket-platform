import { describe, expect, it } from "vitest";
import { nowMinutesIn, utcIntervalToLocal } from "./local-time";

describe("utcIntervalToLocal", () => {
  it("converts a UTC interval to the local date and HH:MM in a fixed-offset zone", () => {
    // 2026-01-05T09:00:00Z .. 09:30:00Z is 14:30-15:00 in Asia/Kolkata (UTC+5:30).
    const local = utcIntervalToLocal(
      { startsAt: new Date("2026-01-05T09:00:00Z"), endsAt: new Date("2026-01-05T09:30:00Z") },
      "Asia/Kolkata",
    );
    expect(local).toEqual({ date: "2026-01-05", start: "14:30", end: "15:00" });
  });

  it("stays correct across a DST transition (America/New_York spring-forward on 2026-03-08)", () => {
    // 2026-03-08T06:45:00Z is 01:45 EST (UTC-5, before the jump); 07:15:00Z is 03:15 EDT (UTC-4, after it).
    // A direct forward read of each instant needs no gap/overlap resolution -- that's only for the reverse
    // direction (zonedTimeToUtc) -- so this interval converts cleanly straddling the transition.
    const local = utcIntervalToLocal(
      { startsAt: new Date("2026-03-08T06:45:00Z"), endsAt: new Date("2026-03-08T07:15:00Z") },
      "America/New_York",
    );
    expect(local).toEqual({ date: "2026-03-08", start: "01:45", end: "03:15" });
  });

  it("clips the end to 24:00 when the interval's end reads on a later local date", () => {
    // 2026-01-05T18:30:00Z .. 19:15:00Z is 2026-01-06 00:00-00:45 in Asia/Kolkata: the end reads a day later than
    // the start.
    const local = utcIntervalToLocal(
      { startsAt: new Date("2026-01-05T18:15:00Z"), endsAt: new Date("2026-01-05T19:15:00Z") },
      "Asia/Kolkata",
    );
    expect(local).toEqual({ date: "2026-01-05", start: "23:45", end: "24:00" });
  });
});

describe("nowMinutesIn", () => {
  it("returns minutes since local midnight in a fixed-offset zone", () => {
    // 2026-01-05T09:15:00Z is 14:45 in Asia/Kolkata: 14*60+45 = 885.
    expect(nowMinutesIn("Asia/Kolkata", new Date("2026-01-05T09:15:00Z"))).toBe(885);
  });

  it("returns 0 at local midnight", () => {
    // 2026-01-05T18:30:00Z is 2026-01-06 00:00 in Asia/Kolkata.
    expect(nowMinutesIn("Asia/Kolkata", new Date("2026-01-05T18:30:00Z"))).toBe(0);
  });

  it("is correct in UTC itself", () => {
    expect(nowMinutesIn("UTC", new Date("2026-01-05T09:15:00Z"))).toBe(555);
  });
});
