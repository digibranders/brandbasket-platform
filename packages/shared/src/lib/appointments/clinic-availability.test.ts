import { describe, expect, it } from "vitest";
import { buildClinicWeek, freePractitionersAt, type BuildClinicWeekInput, type PractitionerCalendar } from "./clinic-availability";
import { buildWeekAvailability, type WeekAvailabilityHoursRow } from "./slots";

const MONDAY = "2026-10-05"; // weekday 0
const TODAY = "2026-10-01";

function hoursRow(dayOfWeek: number, opensAt: string, closesAt: string): WeekAvailabilityHoursRow {
  return { dayOfWeek, opensAt, closesAt, closed: false, openAllDay: false };
}

function practitioner(id: string, overrides: Partial<Omit<PractitionerCalendar, "id">> = {}): PractitionerCalendar {
  return { id, hours: [], leave: [], busy: [], ...overrides };
}

function input(overrides: Partial<BuildClinicWeekInput> = {}): BuildClinicWeekInput {
  return {
    weekStart: MONDAY,
    today: TODAY,
    nowMinutes: 0,
    timeZone: "Asia/Kolkata",
    closures: [],
    slotMinutes: 30,
    minNoticeMinutes: 60,
    horizonDays: 28,
    practitioners: [],
    ...overrides,
  };
}

function mondayOf(week: ReturnType<typeof buildClinicWeek>) {
  const day = week.availability.days.find((candidate) => candidate.date === MONDAY);
  if (day === undefined) throw new Error(`No day for ${MONDAY} in the built week.`);
  return day;
}

function halfHourStarts(from: number, toExclusive: number): string[] {
  const starts: string[] = [];
  for (let minutes = from; minutes < toExclusive; minutes += 30) {
    starts.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return starts;
}

describe("buildClinicWeek", () => {
  it("matches buildWeekAvailability exactly for a single practitioner", () => {
    const hours = [hoursRow(0, "09:00", "13:00"), hoursRow(2, "14:00", "18:00")];
    const closures = [{ startsOn: "2026-10-08", endsOn: "2026-10-08", note: "Dussehra" }];
    const busy = [{ date: MONDAY, start: "10:00", end: "10:30" }];
    const week = buildClinicWeek(input({ closures, practitioners: [practitioner("a", { hours, busy })] }));
    const expected = buildWeekAvailability({ ...input(), closures, hours, busy });
    expect(week.availability).toEqual(expected);
  });

  it("unions practitioners' shifts into one day and records who is free for each slot", () => {
    const week = buildClinicWeek(
      input({
        practitioners: [practitioner("a", { hours: [hoursRow(0, "09:00", "13:00")] }), practitioner("b", { hours: [hoursRow(0, "14:00", "18:00")] })],
      }),
    );
    const monday = mondayOf(week);
    expect(monday.closed).toBe(false);
    expect(monday.slots.map((slot) => slot.start)).toEqual([...halfHourStarts(9 * 60, 13 * 60), ...halfHourStarts(14 * 60, 18 * 60)]);
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual(["a"]);
    expect(freePractitionersAt(week, MONDAY, "14:00")).toEqual(["b"]);
  });

  it("keeps a slot free while any practitioner is free, and marks it taken only when all are booked", () => {
    const hours = [hoursRow(0, "09:00", "13:00")];
    const oneBusy = buildClinicWeek(
      input({
        practitioners: [practitioner("a", { hours, busy: [{ date: MONDAY, start: "09:00", end: "09:30" }] }), practitioner("b", { hours })],
      }),
    );
    expect(mondayOf(oneBusy).slots[0]).toEqual({ start: "09:00", end: "09:30", state: "free" });
    expect(freePractitionersAt(oneBusy, MONDAY, "09:00")).toEqual(["b"]);

    const bothBusy = buildClinicWeek(
      input({
        practitioners: [
          practitioner("a", { hours, busy: [{ date: MONDAY, start: "09:00", end: "09:30" }] }),
          practitioner("b", { hours, busy: [{ date: MONDAY, start: "09:00", end: "09:30" }] }),
        ],
      }),
    );
    expect(mondayOf(bothBusy).slots[0]).toEqual({ start: "09:00", end: "09:30", state: "taken" });
    expect(freePractitionersAt(bothBusy, MONDAY, "09:00")).toEqual([]);
  });

  it("closes a practitioner on leave without closing the clinic, and never exposes the leave note", () => {
    const week = buildClinicWeek(
      input({
        practitioners: [
          practitioner("a", { hours: [hoursRow(0, "09:00", "13:00")], leave: [{ startsOn: MONDAY, endsOn: MONDAY, note: "Conference" }] }),
          practitioner("b", { hours: [hoursRow(0, "14:00", "16:00")] }),
        ],
      }),
    );
    const monday = mondayOf(week);
    expect(monday.closed).toBe(false);
    expect(monday.slots.map((slot) => slot.start)).toEqual(halfHourStarts(14 * 60, 16 * 60));
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual([]);
    expect(JSON.stringify(week.availability)).not.toContain("Conference");
  });

  it("closes every practitioner on a clinic closure, with the closure's note", () => {
    const week = buildClinicWeek(
      input({
        closures: [{ startsOn: MONDAY, endsOn: MONDAY, note: "Diwali" }],
        practitioners: [practitioner("a", { hours: [hoursRow(0, "09:00", "13:00")] }), practitioner("b", { hours: [hoursRow(0, "14:00", "18:00")] })],
      }),
    );
    expect(mondayOf(week)).toEqual({ date: MONDAY, closed: true, closedNote: "Diwali", slots: [] });
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual([]);
  });

  it("closes a day every practitioner has off, with a null note when no clinic closure applies", () => {
    const week = buildClinicWeek(
      input({
        practitioners: [
          practitioner("a", { hours: [hoursRow(1, "09:00", "13:00")] }), // Tuesday only
          practitioner("b", { hours: [hoursRow(0, "09:00", "13:00")], leave: [{ startsOn: MONDAY, endsOn: MONDAY, note: "Sick" }] }),
        ],
      }),
    );
    expect(mondayOf(week)).toEqual({ date: MONDAY, closed: true, closedNote: null, slots: [] });
  });

  it("closes all seven days when the clinic has no practitioners, keeping the week's frame", () => {
    const week = buildClinicWeek(input({ practitioners: [] }));
    expect(week.availability.days).toHaveLength(7);
    expect(week.availability.days.every((day) => day.closed && day.slots.length === 0)).toBe(true);
    expect(week.availability).toMatchObject({ weekStart: MONDAY, today: TODAY, slotMinutes: 30, previousWeek: "2026-09-28", nextWeek: "2026-10-12" });
    expect(week.freeBySlot.size).toBe(0);
  });

  it("keeps a past slot 'past' even when a practitioner has it booked", () => {
    const hours = [hoursRow(0, "09:00", "13:00")];
    const week = buildClinicWeek(
      input({
        today: MONDAY,
        nowMinutes: 600, // 10:00; with 60 minutes' notice nothing before 11:00 is bookable
        practitioners: [practitioner("a", { hours, busy: [{ date: MONDAY, start: "09:00", end: "09:30" }] }), practitioner("b", { hours })],
      }),
    );
    expect(mondayOf(week).slots[0]).toEqual({ start: "09:00", end: "09:30", state: "past" });
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual([]);
  });

  it.each([
    ["a week entirely before today", "2026-09-21"],
    ["a week that crosses the booking horizon", "2026-10-26"],
    ["a week entirely beyond the booking horizon", "2026-11-02"],
  ])("matches buildWeekAvailability for a single practitioner in %s", (_label, weekStart) => {
    const hours = [hoursRow(0, "09:00", "13:00"), hoursRow(3, "10:00", "12:00")];
    const closures = [{ startsOn: "2026-09-24", endsOn: "2026-09-24", note: "Past holiday" }, { startsOn: "2026-10-29", endsOn: "2026-10-29", note: "Beyond" }];
    const busy = [{ date: "2026-09-21", start: "09:00", end: "09:30" }];
    const week = buildClinicWeek(input({ weekStart, closures, practitioners: [practitioner("a", { hours, busy })] }));
    expect(week.availability).toEqual(buildWeekAvailability({ ...input({ weekStart }), closures, hours, busy }));
  });

  it("closes a day beyond the horizon with a null note even when a clinic closure and open practitioners cover it", () => {
    const hours = [hoursRow(3, "09:00", "13:00")];
    // today 2026-10-01 + 28 days -> last bookable 2026-10-28; Thursday 2026-10-29 is one day past it.
    const week = buildClinicWeek(
      input({
        weekStart: "2026-10-26",
        closures: [{ startsOn: "2026-10-29", endsOn: "2026-10-29", note: "Beyond" }],
        practitioners: [practitioner("a", { hours }), practitioner("b", { hours })],
      }),
    );
    expect(week.availability.days[3]).toEqual({ date: "2026-10-29", closed: true, closedNote: null, slots: [] });
    expect(week.availability.nextWeek).toBeNull();
  });

  it("merges practitioners with different off-grid openings into one non-overlapping grid", () => {
    const week = buildClinicWeek(
      input({
        practitioners: [practitioner("a", { hours: [hoursRow(0, "09:15", "11:00")] }), practitioner("b", { hours: [hoursRow(0, "09:00", "10:00")] })],
      }),
    );
    expect(mondayOf(week).slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual(["09:00-09:30", "09:30-10:00", "10:00-10:30", "10:30-11:00"]);
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual(["b"]);
    expect(freePractitionersAt(week, MONDAY, "09:30")).toEqual(["a", "b"]);
    expect(freePractitionersAt(week, MONDAY, "10:30")).toEqual(["a"]);
  });

  it("marks a slot taken when its only practitioner is booked, even if another practitioner works that day", () => {
    const week = buildClinicWeek(
      input({
        practitioners: [
          practitioner("a", { hours: [hoursRow(0, "09:00", "10:00")], busy: [{ date: MONDAY, start: "09:00", end: "09:30" }] }),
          practitioner("b", { hours: [hoursRow(0, "14:00", "15:00")] }),
        ],
      }),
    );
    expect(mondayOf(week).slots[0]).toEqual({ start: "09:00", end: "09:30", state: "taken" });
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual([]);
  });

  it("keeps today open when one practitioner's shift is already past and another's is still ahead", () => {
    const week = buildClinicWeek(
      input({
        today: MONDAY,
        nowMinutes: 12 * 60,
        practitioners: [practitioner("a", { hours: [hoursRow(0, "08:00", "09:00")] }), practitioner("b", { hours: [hoursRow(0, "15:00", "16:00")] })],
      }),
    );
    expect(mondayOf(week)).toEqual({
      date: MONDAY,
      closed: false,
      closedNote: null,
      slots: [
        { start: "08:00", end: "08:30", state: "past" },
        { start: "08:30", end: "09:00", state: "past" },
        { start: "15:00", end: "15:30", state: "free" },
        { start: "15:30", end: "16:00", state: "free" },
      ],
    });
    expect(freePractitionersAt(week, MONDAY, "08:00")).toEqual([]);
    expect(freePractitionersAt(week, MONDAY, "15:00")).toEqual(["b"]);
  });

  it("drops each practitioner's spring-forward-gap slots", () => {
    // America/New_York springs forward on Sunday 2026-03-08: 02:00-02:59 never happens.
    const sunday = "2026-03-08";
    const week = buildClinicWeek(
      input({
        weekStart: sunday,
        today: sunday,
        timeZone: "America/New_York",
        minNoticeMinutes: 0,
        practitioners: [practitioner("a", { hours: [hoursRow(6, "01:00", "04:00")] }), practitioner("b", { hours: [hoursRow(6, "02:00", "03:30")] })],
      }),
    );
    const day = week.availability.days[6];
    expect(day?.slots.map((slot) => slot.start)).toEqual(["01:00", "01:30", "03:00", "03:30"]);
    expect(freePractitionersAt(week, sunday, "03:00")).toEqual(["a", "b"]);
    expect(freePractitionersAt(week, sunday, "02:00")).toEqual([]);
  });

  it("lists free practitioners in the order they were given", () => {
    const hours = [hoursRow(0, "09:00", "13:00")];
    const week = buildClinicWeek(input({ practitioners: [practitioner("zed", { hours }), practitioner("amy", { hours }), practitioner("kim", { hours })] }));
    expect(freePractitionersAt(week, MONDAY, "09:00")).toEqual(["zed", "amy", "kim"]);
  });
});

describe("freePractitionersAt", () => {
  it("is empty for a date or start that isn't in the week", () => {
    const week = buildClinicWeek(input({ practitioners: [practitioner("a", { hours: [hoursRow(0, "09:00", "13:00")] })] }));
    expect(freePractitionersAt(week, "2026-11-30", "09:00")).toEqual([]);
    expect(freePractitionersAt(week, MONDAY, "09:15")).toEqual([]);
  });
});
