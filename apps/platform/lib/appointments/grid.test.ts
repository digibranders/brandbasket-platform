import { describe, expect, it } from "vitest";
import type { WeekAvailabilityHoursRow } from "@fynix/shared/lib/appointments/slots";
import { buildWeekGrid, cellKey, firstName } from "./grid";

// Monday 2026-09-21 through Sunday 2026-09-27. Open Mon-Fri 09:00-11:00, closed Sat/Sun (no rows at all).
const WEEKDAY_HOURS: WeekAvailabilityHoursRow[] = [0, 1, 2, 3, 4].map((dayOfWeek) => ({
  dayOfWeek,
  opensAt: "09:00",
  closesAt: "11:00",
  closed: false,
  openAllDay: false,
}));

describe("buildWeekGrid", () => {
  it("builds one row per hours-derived slot, sorted by start time", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("marks weekdays with hours open and days with no hours rows closed", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    const byDate = new Map(grid.days.map((day) => [day.date, day]));
    expect(byDate.get("2026-09-21")).toEqual({ date: "2026-09-21", closed: false, closedNote: null }); // Monday
    expect(byDate.get("2026-09-26")).toEqual({ date: "2026-09-26", closed: true, closedNote: null }); // Saturday
    expect(byDate.get("2026-09-27")).toEqual({ date: "2026-09-27", closed: true, closedNote: null }); // Sunday
    expect(grid.days).toHaveLength(7);
  });

  it("carries a closure's note onto the day it covers", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [{ startsOn: "2026-09-21", endsOn: "2026-09-21", note: "Holiday" }],
      slotMinutes: 60,
      appointments: [],
    });
    const monday = grid.days.find((day) => day.date === "2026-09-21");
    expect(monday).toEqual({ date: "2026-09-21", closed: true, closedNote: "Holiday" });
  });

  it("marks a day closed when its open hours are too short to produce a single slot", () => {
    // Monday only opens 09:00-09:20 -- shorter than a 60-minute slot, so buildWeekAvailability reports it closed
    // even though it has an open (non-closed) hours row, same as a day with no hours rows at all.
    const hoursWithShortMonday: WeekAvailabilityHoursRow[] = [
      { dayOfWeek: 0, opensAt: "09:00", closesAt: "09:20", closed: false, openAllDay: false },
      ...WEEKDAY_HOURS.slice(1),
    ];
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: hoursWithShortMonday,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    const monday = grid.days.find((day) => day.date === "2026-09-21");
    expect(monday).toEqual({ date: "2026-09-21", closed: true, closedNote: null });
    // The rest of the week still opens 09:00-11:00, so the grid's rows are unaffected by Monday's own closure.
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("adds a row for a booked appointment whose start doesn't match the current slot length", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [],
      slotMinutes: 60,
      appointments: [{ localStart: "09:30", localEnd: "10:00", status: "booked" }],
    });
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "09:30", end: "10:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("does not add a row for a cancelled appointment's mismatched start", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [],
      slotMinutes: 60,
      appointments: [{ localStart: "09:30", localEnd: "10:00", status: "cancelled" }],
    });
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("does not duplicate a row for a booking whose start already matches an hours-derived slot", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: WEEKDAY_HOURS,
      closures: [],
      slotMinutes: 60,
      appointments: [{ localStart: "09:00", localEnd: "09:30", status: "booked" }],
    });
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
    ]);
  });

  it("carries an open-all-day row through to a slot ending at 24:00", () => {
    const openAllDay: WeekAvailabilityHoursRow[] = [{ dayOfWeek: 0, opensAt: null, closesAt: null, closed: false, openAllDay: true }];
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: openAllDay,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    expect(grid.rows.at(-1)).toEqual({ start: "23:00", end: "24:00" });
    expect(grid.rows).toHaveLength(24);
  });

  it("clips an overnight range at 24:00 rather than wrapping into the next day", () => {
    // Opens 22:00, "closes" 02:00 -- closesAt earlier than opensAt clips to 24:00 (see slots.ts's openRangesFor).
    const overnight: WeekAvailabilityHoursRow[] = [{ dayOfWeek: 0, opensAt: "22:00", closesAt: "02:00", closed: false, openAllDay: false }];
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: overnight,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    expect(grid.rows).toEqual([
      { start: "22:00", end: "23:00" },
      { start: "23:00", end: "24:00" },
    ]);
  });

  it("generates a row for each range of a split shift, without a row spanning the gap between them", () => {
    const splitShift: WeekAvailabilityHoursRow[] = [
      { dayOfWeek: 0, opensAt: "09:00", closesAt: "11:00", closed: false, openAllDay: false },
      { dayOfWeek: 0, opensAt: "14:00", closesAt: "16:00", closed: false, openAllDay: false },
    ];
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: splitShift,
      closures: [],
      slotMinutes: 60,
      appointments: [],
    });
    expect(grid.rows).toEqual([
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
      { start: "14:00", end: "15:00" },
      { start: "15:00", end: "16:00" },
    ]);
  });

  it("drops a slot whose local start time is skipped entirely on an America/New_York spring-forward day", () => {
    // 2026-03-08 is a Sunday (dayOfWeek 6) in the week of Monday 2026-03-02, and America/New_York's clocks spring
    // forward that day: 01:59:59 EST becomes 03:00:00 EDT, so 02:00 and 02:30 never happen.
    const sundayOnly: WeekAvailabilityHoursRow[] = [{ dayOfWeek: 6, opensAt: "01:00", closesAt: "04:00", closed: false, openAllDay: false }];
    const grid = buildWeekGrid({
      weekStart: "2026-03-02",
      today: "2026-03-02",
      timeZone: "America/New_York",
      hours: sundayOnly,
      closures: [],
      slotMinutes: 30,
      appointments: [],
    });
    expect(grid.rows).toEqual([
      { start: "01:00", end: "01:30" },
      { start: "01:30", end: "02:00" },
      { start: "03:00", end: "03:30" },
      { start: "03:30", end: "04:00" },
    ]);
  });

  it("still adds a row for a booking that falls on a day with no open hours at all", () => {
    const grid = buildWeekGrid({
      weekStart: "2026-09-21",
      today: "2026-09-21",
      timeZone: "Asia/Kolkata",
      hours: [],
      closures: [],
      slotMinutes: 30,
      appointments: [{ localStart: "09:00", localEnd: "09:30", status: "booked" }],
    });
    expect(grid.days.every((day) => day.closed)).toBe(true);
    expect(grid.rows).toEqual([{ start: "09:00", end: "09:30" }]);
  });
});

describe("cellKey", () => {
  it("joins the date and start with a separator that can't collide", () => {
    expect(cellKey("2026-09-21", "09:00")).toBe("2026-09-21|09:00");
  });
});

describe("firstName", () => {
  it("returns the first word of a full name", () => {
    expect(firstName("Arjun Menon")).toBe("Arjun");
  });

  it("returns the whole string for a one-word name", () => {
    expect(firstName("Cher")).toBe("Cher");
  });

  it("trims surrounding whitespace first", () => {
    expect(firstName("  Priya Nair ")).toBe("Priya");
  });
});
