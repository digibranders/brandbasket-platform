import { describe, expect, it } from "vitest";
import {
  addDays,
  canonicalTimeZone,
  formatMinutes,
  isIsoDate,
  isValidTimeZone,
  localDateIn,
  minutesOfDay,
  mondayOf,
  TIME_ZONE_OPTIONS,
  weekdayIndex,
  zonedTimeToUtc,
} from "./local-date";

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("accepts a leap day", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects a date that does not exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false); // 2027 is not a leap year
  });

  it("rejects strings that are not shaped like a date", () => {
    expect(isIsoDate("2026/02/28")).toBe(false);
    expect(isIsoDate("28-02-2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("rejects a year outside 2000-2100", () => {
    expect(isIsoDate("1999-12-31")).toBe(false);
    expect(isIsoDate("2101-01-01")).toBe(false);
  });

  it("accepts the ends of the allowed year range", () => {
    expect(isIsoDate("2000-01-01")).toBe(true);
    expect(isIsoDate("2100-12-31")).toBe(true);
  });
});

describe("canonicalTimeZone", () => {
  it("resolves a real IANA zone to a name this runtime publishes", () => {
    const canonical = canonicalTimeZone("Asia/Kolkata");
    expect(canonical).not.toBeNull();
    expect(TIME_ZONE_OPTIONS).toContain(canonical);
  });

  it("normalises case", () => {
    expect(canonicalTimeZone("asia/kolkata")).toBe(canonicalTimeZone("Asia/Kolkata"));
    expect(canonicalTimeZone("AMERICA/NEW_YORK")).toBe(canonicalTimeZone("America/New_York"));
  });

  it("normalises legacy aliases to the same zone as their current name", () => {
    expect(canonicalTimeZone("Asia/Calcutta")).toBe(canonicalTimeZone("Asia/Kolkata"));
  });

  it("resolves Etc/UTC", () => {
    expect(canonicalTimeZone("Etc/UTC")).not.toBeNull();
  });

  it("is null for a bare UTC offset", () => {
    expect(canonicalTimeZone("+05:30")).toBeNull();
  });

  it("is null for a zone that does not exist", () => {
    expect(canonicalTimeZone("Mars/Base")).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("agrees with canonicalTimeZone", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("+05:30")).toBe(false);
  });
});

describe("localDateIn", () => {
  it("returns the date where the business is, which can differ from UTC", () => {
    const now = new Date("2026-09-25T20:00:00Z");
    expect(localDateIn("Asia/Kolkata", now)).toBe("2026-09-26");
    expect(localDateIn("America/New_York", now)).toBe("2026-09-25");
  });

  it("crosses a year boundary", () => {
    expect(localDateIn("Asia/Kolkata", new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });

  it("stays on the correct side of a DST change", () => {
    // US clocks fall back on 2026-11-01 at 06:00 UTC. At 04:30 UTC, New York is still on EDT (UTC-4), so it's
    // 00:30 local on Nov 1; getting the offset wrong (using standard-time EST, UTC-5) would read as Oct 31.
    expect(localDateIn("America/New_York", new Date("2026-11-01T04:30:00Z"))).toBe("2026-11-01");
  });
});

describe("addDays", () => {
  it("rolls over into the next year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("accepts a negative count", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("weekdayIndex", () => {
  it("treats Monday as 0", () => {
    expect(weekdayIndex("2026-09-28")).toBe(0);
  });

  it("treats Sunday as 6", () => {
    expect(weekdayIndex("2026-10-04")).toBe(6);
  });
});

describe("mondayOf", () => {
  it("returns the same date when it is already a Monday", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
  });

  it("rolls a mid-week date back to its Monday", () => {
    expect(mondayOf("2026-09-30")).toBe("2026-09-28");
  });

  it("rolls a Sunday back to the Monday that starts its week", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
  });

  it("crosses a month boundary", () => {
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });
});

describe("minutesOfDay", () => {
  it("converts an HH:MM time to minutes since midnight", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("09:30")).toBe(570);
    expect(minutesOfDay("23:59")).toBe(1439);
  });

  it("accepts 24:00 as end-of-day (1440)", () => {
    expect(minutesOfDay("24:00")).toBe(1440);
  });

  it("rejects an hour beyond 24 or a nonzero minute on 24:xx", () => {
    expect(() => minutesOfDay("25:00")).toThrow();
    expect(() => minutesOfDay("24:30")).toThrow();
  });

  it("rejects a minute of 60 or more", () => {
    expect(() => minutesOfDay("09:60")).toThrow();
  });

  it("rejects a string that is not HH:MM", () => {
    expect(() => minutesOfDay("9:30")).toThrow();
    expect(() => minutesOfDay("09:30:00")).toThrow();
    expect(() => minutesOfDay("not-a-time")).toThrow();
  });
});

describe("formatMinutes", () => {
  it("is the inverse of minutesOfDay for ordinary times", () => {
    for (const time of ["00:00", "09:30", "23:59"]) {
      expect(formatMinutes(minutesOfDay(time))).toBe(time);
    }
  });

  it("formats 1440 as 24:00", () => {
    expect(formatMinutes(1440)).toBe("24:00");
  });

  it("pads a single-digit hour and minute", () => {
    expect(formatMinutes(5)).toBe("00:05");
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
  });

  it("rejects a value outside 0-1440 or a non-integer", () => {
    expect(() => formatMinutes(-1)).toThrow();
    expect(() => formatMinutes(1441)).toThrow();
    expect(() => formatMinutes(90.5)).toThrow();
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a zone with no DST (Asia/Calcutta, UTC+05:30)", () => {
    expect(zonedTimeToUtc("2026-09-28", "09:00", "Asia/Calcutta").toISOString()).toBe("2026-09-28T03:30:00.000Z");
  });

  it("round-trips UTC itself", () => {
    expect(zonedTimeToUtc("2026-09-28", "09:00", "UTC").toISOString()).toBe("2026-09-28T09:00:00.000Z");
  });

  describe("America/New_York spring-forward, 2026-03-08 (clocks jump 01:59:59 EST -> 03:00:00 EDT)", () => {
    it("converts an ordinary time before the jump (EST, UTC-5)", () => {
      expect(zonedTimeToUtc("2026-03-08", "01:30", "America/New_York").toISOString()).toBe("2026-03-08T06:30:00.000Z");
    });

    it("converts an ordinary time after the jump (EDT, UTC-4)", () => {
      expect(zonedTimeToUtc("2026-03-08", "03:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    });

    it("moves a non-existent time (02:30, inside the skipped hour) forward by the length of the gap", () => {
      // 02:30 is exactly 30 minutes into the 1-hour gap, so it resolves to the same instant as 03:30 EDT: the
      // documented policy is to slide a skipped local time forward by the gap's length rather than clamp it to
      // the instant the clocks resume (03:00).
      const result = zonedTimeToUtc("2026-03-08", "02:30", "America/New_York");
      expect(result.toISOString()).toBe("2026-03-08T07:30:00.000Z");
      expect(result.toISOString()).toBe(zonedTimeToUtc("2026-03-08", "03:30", "America/New_York").toISOString());
    });
  });

  describe("Europe/London fall-back, 2026-10-25 (clocks repeat 01:00-01:59 -> first as BST, then as GMT)", () => {
    it("converts an ordinary time before the ambiguous hour (BST, UTC+1)", () => {
      expect(zonedTimeToUtc("2026-10-25", "00:30", "Europe/London").toISOString()).toBe("2026-10-24T23:30:00.000Z");
    });

    it("converts an ordinary time after the ambiguous hour (GMT, UTC+0)", () => {
      expect(zonedTimeToUtc("2026-10-25", "02:30", "Europe/London").toISOString()).toBe("2026-10-25T02:30:00.000Z");
    });

    it("resolves an ambiguous time (01:30, named twice) to the earlier instant, per policy", () => {
      // 01:30 happens twice: once as BST (00:30Z) and again an hour later as GMT (01:30Z). Documented policy:
      // always pick the earlier of the two.
      expect(zonedTimeToUtc("2026-10-25", "01:30", "Europe/London").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    });
  });

  describe("minute-by-minute against a brute-force reference", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    function pad2(value: number): string {
      return String(value).padStart(2, "0");
    }

    /**
     * A UTC-minute reading of `timeZone`, independent of production code's offsetMinutesAt/zonedTimeToUtc: its
     * local wall-clock reading, expressed the same way zonedTimeToUtc's `naiveMs` is (Date.UTC of the reading's
     * own digits). Every probed instant here is already minute-aligned (a multiple of 60_000ms), so this never
     * exercises the millisecond-rounding bug the caching/whole-second fix above addresses -- it's a genuinely
     * different method (a linear scan) for computing the same policy, not a copy of the binary search.
     */
    function scanLocalMinutes(timeZone: string, centerDate: string): Array<{ utcMs: number; localMs: number }> {
      const [year, month, day] = centerDate.split("-").map(Number) as [number, number, number];
      const centerMs = Date.UTC(year, month - 1, day, 0, 0, 0);
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const samples: Array<{ utcMs: number; localMs: number }> = [];
      // A day of margin on either side is more than enough: no real time zone's DST transition moves the clock by
      // more than a couple of hours, so the whole transition (and both its unambiguous neighbours) sits well
      // inside a 3-day window centered on `centerDate`.
      for (let utcMs = centerMs - DAY_MS; utcMs <= centerMs + 2 * DAY_MS; utcMs += 60_000) {
        const parts = dtf.formatToParts(new Date(utcMs));
        const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
        const hour = get("hour") === "24" ? "00" : get("hour");
        const localMs = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), Number(hour), Number(get("minute")));
        samples.push({ utcMs, localMs });
      }
      return samples;
    }

    /**
     * Ground truth for zonedTimeToUtc, computed a completely different way: given `samples` (scanLocalMinutes's
     * one-time scan of every UTC minute around `date`), either find the requested local reading directly
     * (returning its earliest occurrence, which handles an ambiguous fall-back reading for free) or, when it
     * doesn't appear at all (a spring-forward gap), find the last scanned reading strictly before it and the first
     * strictly after, and carry the same offset the "before" reading used -- which is exactly "slide the requested
     * time forward by the gap", worked out arithmetically instead of via the policy table in
     * resolveOffsetAcrossTransition.
     */
    function referenceZonedTimeToUtc(
      date: string,
      time: string,
      samples: ReadonlyArray<{ readonly utcMs: number; readonly localMs: number }>,
    ): Date {
      const [year, month, day] = date.split("-").map(Number) as [number, number, number];
      const [hour, minute] = time.split(":").map(Number) as [number, number];
      const target = Date.UTC(year, month - 1, day, hour, minute);

      let earliestExact: number | null = null;
      for (const sample of samples) {
        if (sample.localMs === target && (earliestExact === null || sample.utcMs < earliestExact)) {
          earliestExact = sample.utcMs;
        }
      }
      if (earliestExact !== null) return new Date(earliestExact);

      for (let i = 0; i < samples.length - 1; i += 1) {
        if (samples[i]!.localMs < target && samples[i + 1]!.localMs > target) {
          return new Date(samples[i]!.utcMs + (target - samples[i]!.localMs));
        }
      }
      throw new Error(`referenceZonedTimeToUtc: could not bracket ${date} ${time}.`);
    }

    const cases: ReadonlyArray<{ readonly zone: string; readonly date: string }> = [
      { zone: "America/New_York", date: "2026-03-08" }, // spring forward
      { zone: "America/New_York", date: "2026-11-01" }, // fall back
      { zone: "Europe/London", date: "2026-03-29" }, // spring forward
      { zone: "Europe/London", date: "2026-10-25" }, // fall back
      { zone: "Australia/Sydney", date: "2026-04-05" }, // fall back (Southern Hemisphere)
      { zone: "Australia/Sydney", date: "2026-10-04" }, // spring forward (Southern Hemisphere)
    ];

    for (const { zone, date } of cases) {
      it(
        `matches the brute-force reference for every minute of ${date} in ${zone}`,
        () => {
          // Scanned once per date/zone and reused for all 1440 minutes: re-scanning per minute would be
          // quadratic and far too slow for a test.
          const samples = scanLocalMinutes(zone, date);
          for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += 1) {
            const time = `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
            const actual = zonedTimeToUtc(date, time, zone);
            const expected = referenceZonedTimeToUtc(date, time, samples);
            expect(actual.toISOString(), `${date} ${time} ${zone}`).toBe(expected.toISOString());
          }
        },
        20_000,
      );
    }
  });
});
