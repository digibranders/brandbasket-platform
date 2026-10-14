import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBusyIntervals, readPractitionerSchedules, type Database, type PractitionerScheduleRow } from "@fynix/db";
import { buildPractitionerCalendars, loadClinicCalendars } from "./clinic-calendars";

vi.mock("@fynix/db", () => ({ listBusyIntervals: vi.fn(), readPractitionerSchedules: vi.fn() }));

const mockedListBusyIntervals = vi.mocked(listBusyIntervals);
const mockedReadPractitionerSchedules = vi.mocked(readPractitionerSchedules);

const TIME_ZONE = "Asia/Kolkata";
const CLINIC_HOURS = [
  { id: "c1", dayOfWeek: 0, opensAt: "09:00", closesAt: "17:00", closed: false, openAllDay: false },
] as const;

function schedule(overrides: Partial<PractitionerScheduleRow> & Pick<PractitionerScheduleRow, "id">): PractitionerScheduleRow {
  return { name: `Dr. ${overrides.id}`, title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [], ...overrides };
}

const ON_CLINIC_HOURS = schedule({ id: "p1" });
const OWN_HOURS = schedule({
  id: "p2",
  usesClinicHours: false,
  hours: [{ id: "h1", dayOfWeek: 1, opensAt: "10:00", closesAt: "14:00", closed: false, openAllDay: false }],
  leave: [{ id: "l1", startsOn: "2026-10-06", endsOn: "2026-10-07", note: "Conference" }],
});

describe("buildPractitionerCalendars", () => {
  it("gives a doctor on clinic hours the clinic's hours, and one with their own hours their own", () => {
    const { calendars } = buildPractitionerCalendars({
      schedules: [ON_CLINIC_HOURS, OWN_HOURS],
      busy: [],
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      onlyPractitionerId: null,
    });
    expect(calendars).toEqual([
      { id: "p1", hours: CLINIC_HOURS, leave: [], busy: [] },
      { id: "p2", hours: OWN_HOURS.hours, leave: OWN_HOURS.leave, busy: [] },
    ]);
  });

  it("files each busy interval under its own doctor, in local time", () => {
    const { calendars } = buildPractitionerCalendars({
      schedules: [ON_CLINIC_HOURS, OWN_HOURS],
      busy: [
        // 04:30Z is 10:00 in Asia/Kolkata.
        { startsAt: new Date("2026-10-05T04:30:00Z"), endsAt: new Date("2026-10-05T05:00:00Z"), practitionerId: "p2" },
        { startsAt: new Date("2026-10-05T05:00:00Z"), endsAt: new Date("2026-10-05T05:30:00Z"), practitionerId: "p1" },
        { startsAt: new Date("2026-10-05T06:00:00Z"), endsAt: new Date("2026-10-05T06:30:00Z"), practitionerId: "p2" },
      ],
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      onlyPractitionerId: null,
    });
    expect(calendars.map((calendar) => [calendar.id, calendar.busy])).toEqual([
      ["p1", [{ date: "2026-10-05", start: "10:30", end: "11:00" }]],
      [
        "p2",
        [
          { date: "2026-10-05", start: "10:00", end: "10:30" },
          { date: "2026-10-05", start: "11:30", end: "12:00" },
        ],
      ],
    ]);
  });

  it("drops a busy interval belonging to no active doctor (an archived one's bookings block nobody)", () => {
    const { calendars } = buildPractitionerCalendars({
      schedules: [ON_CLINIC_HOURS],
      busy: [{ startsAt: new Date("2026-10-05T04:30:00Z"), endsAt: new Date("2026-10-05T05:00:00Z"), practitionerId: "archived" }],
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      onlyPractitionerId: null,
    });
    expect(calendars).toEqual([{ id: "p1", hours: CLINIC_HOURS, leave: [], busy: [] }]);
  });

  it("keeps only the chosen doctor's calendar while still returning every active doctor", () => {
    const result = buildPractitionerCalendars({
      schedules: [ON_CLINIC_HOURS, OWN_HOURS],
      busy: [],
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      onlyPractitionerId: "p2",
    });
    expect(result.practitioners).toEqual([ON_CLINIC_HOURS, OWN_HOURS]);
    expect(result.calendars.map((calendar) => calendar.id)).toEqual(["p2"]);
  });

  it("returns no calendars when the chosen id is not an active doctor", () => {
    const result = buildPractitionerCalendars({
      schedules: [ON_CLINIC_HOURS],
      busy: [],
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      onlyPractitionerId: "gone",
    });
    expect(result.calendars).toEqual([]);
  });
});

describe("loadClinicCalendars", () => {
  const db = { name: "staff-db" } as unknown as Database;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads schedules and the range's busy intervals for the business, then builds the calendars", async () => {
    mockedReadPractitionerSchedules.mockResolvedValue([ON_CLINIC_HOURS]);
    mockedListBusyIntervals.mockResolvedValue([
      { startsAt: new Date("2026-10-05T04:30:00Z"), endsAt: new Date("2026-10-05T05:00:00Z"), practitionerId: "p1" },
    ]);
    const fromUtc = new Date("2026-10-04T18:30:00Z");
    const toUtc = new Date("2026-10-05T18:30:00Z");

    const result = await loadClinicCalendars(db, "biz-1", {
      clinicHours: CLINIC_HOURS,
      timeZone: TIME_ZONE,
      fromUtc,
      toUtc,
      onlyPractitionerId: null,
    });

    expect(mockedReadPractitionerSchedules).toHaveBeenCalledWith(db, "biz-1");
    expect(mockedListBusyIntervals).toHaveBeenCalledWith(db, "biz-1", fromUtc, toUtc);
    expect(result.calendars).toEqual([
      { id: "p1", hours: CLINIC_HOURS, leave: [], busy: [{ date: "2026-10-05", start: "10:00", end: "10:30" }] },
    ]);
  });
});
