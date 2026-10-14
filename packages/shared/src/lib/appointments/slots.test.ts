import { describe, expect, it } from "vitest";
import { weekdayIndex } from "../calendar/local-date";
import {
  buildWeekAvailability,
  findSlot,
  isSlotMinutes,
  slotLabel,
  SLOT_MINUTE_OPTIONS,
  type BuildWeekAvailabilityInput,
  type WeekAvailabilityBusy,
  type WeekAvailabilityClosure,
  type WeekAvailabilityHoursRow,
} from "./slots";

const MONDAY = "2026-09-28"; // weekday 0
const TUESDAY = "2026-09-29"; // weekday 1

function hoursRow(overrides: Partial<WeekAvailabilityHoursRow> & Pick<WeekAvailabilityHoursRow, "dayOfWeek">): WeekAvailabilityHoursRow {
  return { opensAt: null, closesAt: null, closed: false, openAllDay: false, ...overrides };
}

function input(overrides: Partial<BuildWeekAvailabilityInput> = {}): BuildWeekAvailabilityInput {
  return {
    weekStart: MONDAY,
    today: MONDAY,
    nowMinutes: 8 * 60, // 08:00
    // No DST, so it never interacts with the past/notice math the other fixtures exercise; tests that care about a
    // spring-forward gap pass their own timeZone.
    timeZone: "Asia/Kolkata",
    hours: [],
    closures: [],
    slotMinutes: 30,
    minNoticeMinutes: 60,
    horizonDays: 28,
    busy: [],
    ...overrides,
  };
}

function dayFor(availability: ReturnType<typeof buildWeekAvailability>, date: string) {
  const day = availability.days.find((candidate) => candidate.date === date);
  if (day === undefined) throw new Error(`No day for ${date} in the built availability.`);
  return day;
}

describe("buildWeekAvailability", () => {
  it("normalises weekStart to that week's Monday, from any day in the week", () => {
    const availability = buildWeekAvailability(input({ weekStart: "2026-09-30" })); // a Wednesday
    expect(availability.weekStart).toBe(MONDAY);
    expect(availability.days).toHaveLength(7);
    expect(availability.days.map((day) => day.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("closes a weekday with no hours rows at all", () => {
    const availability = buildWeekAvailability(input({ hours: [] }));
    const monday = dayFor(availability, MONDAY);
    expect(monday.closed).toBe(true);
    expect(monday.closedNote).toBeNull();
    expect(monday.slots).toEqual([]);
  });

  it("closes a weekday whose rows are all closed", () => {
    const availability = buildWeekAvailability(
      input({ hours: [hoursRow({ dayOfWeek: 0, closed: true }), hoursRow({ dayOfWeek: 0, closed: true })] }),
    );
    expect(dayFor(availability, MONDAY).closed).toBe(true);
  });

  it("splits a day into more than one range for a split shift, with no slots in the gap", () => {
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 60,
        hours: [
          // Deliberately out of order, to also prove the output is sorted by start time.
          hoursRow({ dayOfWeek: 0, opensAt: "14:00", closesAt: "17:00" }),
          hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "12:00" }),
        ],
      }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.closed).toBe(false);
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual([
      "09:00-10:00",
      "10:00-11:00",
      "11:00-12:00",
      "14:00-15:00",
      "15:00-16:00",
      "16:00-17:00",
    ]);
  });

  it("merges overlapping and touching hours rows before generating slots, instead of producing offset or duplicate slots", () => {
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 60,
        hours: [
          hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "11:00" }),
          hoursRow({ dayOfWeek: 0, opensAt: "10:00", closesAt: "12:00" }), // overlaps the row above
          hoursRow({ dayOfWeek: 0, opensAt: "10:10", closesAt: "11:10" }), // entirely inside the merged range
          hoursRow({ dayOfWeek: 0, opensAt: "12:00", closesAt: "13:00" }), // merely touches (starts where the merged range ends)
        ],
      }),
    );
    const monday = dayFor(availability, MONDAY);
    // A single merged 09:00-13:00 range, aligned once from 09:00 -- not slots aligned to 10:00 or 10:10, and not
    // any slot generated twice.
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00"]);
  });

  it("accepts HH:MM:SS hours rows and busy intervals the same as HH:MM", () => {
    const busy: WeekAvailabilityBusy[] = [{ date: MONDAY, start: "09:15:00", end: "09:45:00" }];
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 30,
        nowMinutes: 0,
        minNoticeMinutes: 0,
        hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00:00", closesAt: "10:00:00" })],
        busy,
      }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => [slot.start, slot.state])).toEqual([
      ["09:00", "taken"],
      ["09:30", "taken"],
    ]);
  });

  it("marks a day closed with the closure's note, even when it would otherwise have hours", () => {
    const closures: WeekAvailabilityClosure[] = [{ startsOn: MONDAY, endsOn: MONDAY, note: "Diwali" }];
    const availability = buildWeekAvailability(
      input({ hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "17:00" })], closures }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.closed).toBe(true);
    expect(monday.closedNote).toBe("Diwali");
    expect(monday.slots).toEqual([]);
  });

  it("clips an overnight range at 24:00 rather than wrapping into the next day", () => {
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, hours: [hoursRow({ dayOfWeek: 0, opensAt: "22:00", closesAt: "02:00" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["22:00-22:30", "22:30-23:00", "23:00-23:30", "23:30-24:00"]);
  });

  it("treats 'open all day' as 00:00-24:00", () => {
    const availability = buildWeekAvailability(input({ slotMinutes: 60, hours: [hoursRow({ dayOfWeek: 0, openAllDay: true })] }));
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots).toHaveLength(24);
    expect(monday.slots[0]).toMatchObject({ start: "00:00", end: "01:00" });
    expect(monday.slots[23]).toMatchObject({ start: "23:00", end: "24:00" });
  });

  it("drops a 45-minute slot that would overrun a 60-minute range instead of shortening it", () => {
    const availability = buildWeekAvailability(
      input({ slotMinutes: 45, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["09:00-09:45"]);
  });

  it("aligns slots to whole multiples of slotMinutes from midnight, not to an off-grid opening time", () => {
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:15", closesAt: "12:00" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    // 09:15 is off the 30-minute grid, so the first slot waits for 09:30 rather than starting at 09:15.
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["09:30-10:00", "10:00-10:30", "10:30-11:00", "11:00-11:30", "11:30-12:00"]);
  });

  it("leaves slots unchanged when the opening time is already on the grid", () => {
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "13:00" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => slot.start)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
  });

  it("aligns 45-minute slots to the 45-minute grid from midnight (14:00 opening -> first slot 14:15)", () => {
    const availability = buildWeekAvailability(
      input({ slotMinutes: 45, hours: [hoursRow({ dayOfWeek: 0, opensAt: "14:00", closesAt: "18:00" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    // Grid points: ..., 13:30, 14:15, 15:00, 15:45, 16:30, 17:15 (17:15-18:00 fits exactly).
    expect(monday.slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["14:15-15:00", "15:00-15:45", "15:45-16:30", "16:30-17:15", "17:15-18:00"]);
  });

  it("marks a slot taken when it only partially overlaps a busy interval", () => {
    const busy: WeekAvailabilityBusy[] = [{ date: MONDAY, start: "09:15", end: "09:45" }];
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, nowMinutes: 0, minNoticeMinutes: 0, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })], busy }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => [slot.start, slot.state])).toEqual([
      ["09:00", "taken"], // 09:00-09:30 overlaps 09:15-09:45
      ["09:30", "taken"], // 09:30-10:00 overlaps 09:15-09:45
    ]);
  });

  it("does not mark an adjacent, non-overlapping slot taken", () => {
    const busy: WeekAvailabilityBusy[] = [{ date: MONDAY, start: "09:30", end: "10:00" }];
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, nowMinutes: 0, minNoticeMinutes: 0, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:30" })], busy }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => [slot.start, slot.state])).toEqual([
      ["09:00", "free"],
      ["09:30", "taken"],
      ["10:00", "free"],
    ]);
  });

  it("prefers past over taken when a slot is both", () => {
    const busy: WeekAvailabilityBusy[] = [{ date: MONDAY, start: "09:00", end: "09:30" }];
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 30,
        today: MONDAY,
        nowMinutes: 12 * 60, // 12:00, well after the 09:00 slot
        minNoticeMinutes: 0,
        hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })],
        busy,
      }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots[0]).toMatchObject({ start: "09:00", state: "past" });
  });

  it("marks a slot before now+minNotice as past, and one after as free", () => {
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 30,
        today: MONDAY,
        nowMinutes: 9 * 60, // 09:00
        minNoticeMinutes: 60, // one hour notice: nothing before 10:00 is bookable
        hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "11:00" })],
      }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.slots.map((slot) => [slot.start, slot.state])).toEqual([
      ["09:00", "past"],
      ["09:30", "past"],
      ["10:00", "free"],
      ["10:30", "free"],
    ]);
  });

  it("spills minimum notice past midnight into the next day's early slots", () => {
    const availability = buildWeekAvailability(
      input({
        slotMinutes: 30,
        today: MONDAY,
        nowMinutes: 23 * 60, // 23:00 today
        minNoticeMinutes: 120, // 2 hours notice -> nothing before 01:00 tomorrow is bookable
        hours: [hoursRow({ dayOfWeek: 1, openAllDay: true })], // Tuesday, all day
      }),
    );
    const tuesday = dayFor(availability, TUESDAY);
    expect(tuesday.closed).toBe(false);
    expect(tuesday.slots.slice(0, 3).map((slot) => [slot.start, slot.state])).toEqual([
      ["00:00", "past"],
      ["00:30", "past"],
      ["01:00", "free"],
    ]);
  });

  it("keeps a day before today open, with every slot past (documented decision, see buildWeekAvailability's doc comment)", () => {
    const lastMonday = "2026-09-21";
    const availability = buildWeekAvailability(
      input({
        weekStart: lastMonday,
        today: MONDAY,
        hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })],
      }),
    );
    const day = dayFor(availability, lastMonday);
    expect(day.closed).toBe(false);
    expect(day.slots.every((slot) => slot.state === "past")).toBe(true);
    expect(day.slots.length).toBeGreaterThan(0);
  });

  it("still closes a genuinely closed day (a closure, or a closed weekday) in the past", () => {
    const lastMonday = "2026-09-21";
    const closures: WeekAvailabilityClosure[] = [{ startsOn: lastMonday, endsOn: lastMonday, note: "Holiday" }];
    const availability = buildWeekAvailability(
      input({ weekStart: lastMonday, today: MONDAY, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })], closures }),
    );
    expect(dayFor(availability, lastMonday)).toMatchObject({ closed: true, closedNote: "Holiday" });
  });

  it("closes every day after today + horizonDays - 1, with a null note, regardless of hours or closures", () => {
    const availability = buildWeekAvailability(
      input({
        today: MONDAY, // 2026-09-28
        horizonDays: 3, // last bookable date is 2026-09-30 (Wednesday)
        hours: Array.from({ length: 7 }, (_unused, dayOfWeek) => hoursRow({ dayOfWeek, opensAt: "09:00", closesAt: "17:00" })),
      }),
    );
    expect(dayFor(availability, "2026-09-30")).toMatchObject({ closed: false }); // last bookable day: still open
    const thursday = dayFor(availability, "2026-10-01");
    expect(thursday.closed).toBe(true);
    expect(thursday.closedNote).toBeNull();
    expect(thursday.slots).toEqual([]);
  });

  it("closes a day whose open hours don't produce a single slot, with a null note", () => {
    // A 20-minute range can't fit a single 30-minute slot.
    const availability = buildWeekAvailability(
      input({ slotMinutes: 30, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "09:20" })] }),
    );
    const monday = dayFor(availability, MONDAY);
    expect(monday.closed).toBe(true);
    expect(monday.closedNote).toBeNull();
    expect(monday.slots).toEqual([]);
  });

  it("throws when slotMinutes is not one of the published options", () => {
    expect(() => buildWeekAvailability(input({ slotMinutes: 25 }))).toThrow();
  });

  it("drops a slot whose local start time is skipped on a spring-forward day, instead of showing a phantom slot", () => {
    // America/New_York springs forward on 2026-03-08: 01:59:59 EST becomes 03:00:00 EDT, so 02:00-02:59 never
    // happens locally that day.
    const springForwardDay = "2026-03-08";
    const availability = buildWeekAvailability(
      input({
        weekStart: springForwardDay,
        today: springForwardDay,
        nowMinutes: 0,
        minNoticeMinutes: 0,
        timeZone: "America/New_York",
        slotMinutes: 30,
        hours: [hoursRow({ dayOfWeek: weekdayIndex(springForwardDay), opensAt: "01:00", closesAt: "04:00" })],
      }),
    );
    const day = dayFor(availability, springForwardDay);
    expect(day.closed).toBe(false);
    expect(day.slots.map((slot) => slot.start)).toEqual(["01:00", "01:30", "03:00", "03:30"]);
  });

  it("is null for previousWeek when the whole previous week is before today", () => {
    const availability = buildWeekAvailability(input({ weekStart: MONDAY, today: MONDAY }));
    expect(availability.previousWeek).toBeNull();
  });

  it("gives previousWeek's Monday when any part of the previous week is not yet past", () => {
    // today is the Sunday of "this" week's previous week, so that week's Sunday (the 7th day) is still today.
    const availability = buildWeekAvailability(input({ weekStart: MONDAY, today: "2026-09-27" }));
    expect(availability.previousWeek).toBe("2026-09-21");
  });

  it("is null for nextWeek when its Monday starts after the last bookable day", () => {
    const availability = buildWeekAvailability(input({ weekStart: MONDAY, today: MONDAY, horizonDays: 7 })); // last bookable: next Sunday
    expect(availability.nextWeek).toBeNull();
  });

  it("gives nextWeek's Monday when it is within the horizon", () => {
    const availability = buildWeekAvailability(input({ weekStart: MONDAY, today: MONDAY, horizonDays: 14 }));
    expect(availability.nextWeek).toBe("2026-10-05");
  });

  it("nextWeek horizon edge: non-null when the last bookable day falls exactly on next Monday, null one day earlier", () => {
    // Next Monday is 2026-10-05 (weekStart + 7). horizonDays: 8 puts the last bookable date (today + 7) exactly
    // on it: 2026-09-28 + 7 = 2026-10-05.
    const onTheEdge = buildWeekAvailability(input({ weekStart: MONDAY, today: MONDAY, horizonDays: 8 }));
    expect(onTheEdge.nextWeek).toBe("2026-10-05");

    // horizonDays: 7 puts the last bookable date one day earlier (2026-10-04), so next Monday is now excluded.
    const oneDayShort = buildWeekAvailability(input({ weekStart: MONDAY, today: MONDAY, horizonDays: 7 }));
    expect(oneDayShort.nextWeek).toBeNull();
  });
});

describe("slotLabel", () => {
  it("formats a range with an en dash", () => {
    expect(slotLabel("09:00", "09:30")).toBe("09:00 – 09:30");
  });
});

describe("findSlot", () => {
  const availability = buildWeekAvailability(
    input({ slotMinutes: 30, nowMinutes: 0, minNoticeMinutes: 0, hours: [hoursRow({ dayOfWeek: 0, opensAt: "09:00", closesAt: "10:00" })] }),
  );

  it("returns the matching slot", () => {
    expect(findSlot(availability, MONDAY, "09:00")).toMatchObject({ start: "09:00", end: "09:30", state: "free" });
  });

  it("returns null for a start time that is not a real slot", () => {
    expect(findSlot(availability, MONDAY, "09:15")).toBeNull();
  });

  it("returns null for a date outside the built week", () => {
    expect(findSlot(availability, "2026-10-20", "09:00")).toBeNull();
  });

  it("returns null for a closed day", () => {
    expect(findSlot(availability, TUESDAY, "09:00")).toBeNull();
  });
});

describe("SLOT_MINUTE_OPTIONS / isSlotMinutes", () => {
  it("accepts every published option", () => {
    for (const option of SLOT_MINUTE_OPTIONS) expect(isSlotMinutes(option)).toBe(true);
  });

  it("rejects a value that is not one of the options", () => {
    expect(isSlotMinutes(10)).toBe(false);
    expect(isSlotMinutes(25)).toBe(false);
  });
});
