import { describe, expect, it } from "vitest";
import type { AdDayCount } from "@fynix/db";
import { buildAdResults, formatClickRate, weekDays } from "./advertise-results";

const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07"] as const;

function count(placement: AdDayCount["placement"], day: string, kind: AdDayCount["kind"], total: number): AdDayCount {
  return { placement, day, kind, count: total };
}

describe("weekDays", () => {
  it("lists the seven days from a Monday", () => {
    expect(weekDays("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("refuses something that is not a date", () => {
    expect(() => weekDays("soon")).toThrow(RangeError);
  });
});

describe("buildAdResults", () => {
  const counts = [
    count("home", "2026-10-05", "impression", 40),
    count("home", "2026-10-07", "impression", 60),
    count("home", "2026-10-07", "click", 5),
    count("side", "2026-10-06", "impression", 10),
    count("home", "2026-09-30", "impression", 25),
  ];

  it("totals every ad over the recent days", () => {
    const { total } = buildAdResults(counts, DAYS, []);
    expect(total).toMatchObject({ seen: 110, clicks: 5, clickRate: 5 / 110, seenByDay: [40, 10, 60], clicksByDay: [0, 0, 5] });
  });

  it("gives each booking only its own placement's counts over its own week, newest week first", () => {
    const { bookings } = buildAdResults(
      counts,
      DAYS,
      [
        { placement: "home", weekStart: "2026-09-28" },
        { placement: "home", weekStart: "2026-10-05" },
        { placement: "side", weekStart: "2026-10-05" },
      ],
    );
    expect(bookings.map((entry) => entry.id)).toEqual(["home:2026-10-05", "side:2026-10-05", "home:2026-09-28"]);
    const [home, side, earlier] = bookings;
    expect(home).toMatchObject({ seen: 100, clicks: 5, clickRate: 0.05, seenByDay: [40, 0, 60, 0, 0, 0, 0], clicksByDay: [0, 0, 5, 0, 0, 0, 0] });
    expect(side).toMatchObject({ seen: 10, clicks: 0, clickRate: 0 });
    expect(earlier).toMatchObject({ seen: 25, clicks: 0 });
    expect(earlier?.days[2]).toBe("2026-09-30");
  });

  it("has no click rate for an ad nobody saw, even with a click", () => {
    const [only] = buildAdResults([count("profile", "2026-10-06", "click", 2)], DAYS, [{ placement: "profile", weekStart: "2026-10-05" }]).bookings;
    expect(only).toMatchObject({ seen: 0, clicks: 2, clickRate: null });
  });

  it("answers a booking with nothing counted as zeros", () => {
    const [only] = buildAdResults([], DAYS, [{ placement: "home", weekStart: "2026-10-05" }]).bookings;
    expect(only).toMatchObject({ seen: 0, clicks: 0, clickRate: null });
    expect(only?.seenByDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("formatClickRate", () => {
  it("writes a rate the way a person reads it", () => {
    expect(formatClickRate(null)).toBe("–");
    expect(formatClickRate(0)).toBe("0.0%");
    expect(formatClickRate(0.0243)).toBe("2.4%");
    expect(formatClickRate(0.123)).toBe("12%");
  });
});
