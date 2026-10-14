import type { PractitionerScheduleRow } from "@firstfold/db";
import type { WeekAvailabilityHoursRow } from "@firstfold/shared/lib/appointments/slots";
import { describe, expect, it } from "vitest";
import { freeDoctorsForBooking, type FreeDoctorsInput } from "./free-doctors";

/*
 * Aster Physio, Asia/Kolkata (UTC+05:30, no DST). Thursday 8 October 2026 is the day under test; "now" is the
 * Monday before, so nothing is past. The clinic opens 09:00-17:00 every weekday; Rahul works his own Tue/Thu
 * 14:00-18:00.
 */
const TIME_ZONE = "Asia/Kolkata";
const NOW = new Date("2026-10-05T04:30:00Z"); // Mon 5 Oct, 10:00 local
const ASTER_ID = "11111111-1111-4111-8111-111111111111";
const RAHUL_ID = "22222222-2222-4222-8222-222222222222";
const MEERA_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";

function clinicHours(): WeekAvailabilityHoursRow[] {
  return [0, 1, 2, 3, 4].map((dayOfWeek) => ({ dayOfWeek, opensAt: "09:00:00", closesAt: "17:00:00", closed: false, openAllDay: false }));
}

function schedule(id: string, name: string, overrides: Partial<PractitionerScheduleRow> = {}): PractitionerScheduleRow {
  return { id, name, title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [], ...overrides };
}

// dayOfWeek is Monday-first, 0-6 (weekdayIndex, packages/shared/src/lib/calendar/local-date.ts): Tue 1, Thu 3.
const RAHUL_OWN_HOURS = [1, 3].map((dayOfWeek) => ({
  id: `h${String(dayOfWeek)}`,
  dayOfWeek,
  opensAt: "14:00:00",
  closesAt: "18:00:00",
  closed: false,
  openAllDay: false,
}));

/** Local "HH:MM" on 8 Oct 2026 in Kolkata, as a UTC instant. */
function at(localTime: string): Date {
  return new Date(`2026-10-08T${localTime}:00+05:30`);
}

function input(overrides: Partial<FreeDoctorsInput> = {}): FreeDoctorsInput {
  return {
    booking: {
      id: BOOKING_ID,
      practitionerId: ASTER_ID,
      localDate: "2026-10-08",
      localStart: "15:00",
      status: "booked",
      startsAt: at("15:00"),
    },
    schedules: [
      schedule(ASTER_ID, "Aster Physio"),
      schedule(RAHUL_ID, "Dr Rahul Menon", { usesClinicHours: false, hours: RAHUL_OWN_HOURS }),
      schedule(MEERA_ID, "Dr Meera Iyer"),
    ],
    clinicHours: clinicHours(),
    closures: [],
    bookingsThatDay: [{ id: BOOKING_ID, practitionerId: ASTER_ID, startsAt: at("15:00"), endsAt: at("15:30"), status: "booked" }],
    timeZone: TIME_ZONE,
    slotMinutes: 30,
    now: NOW,
    ...overrides,
  };
}

describe("freeDoctorsForBooking", () => {
  it("lists every other doctor working then with nothing booked, in display order", () => {
    expect(freeDoctorsForBooking(input())).toEqual([RAHUL_ID, MEERA_ID]);
  });

  it("never lists the doctor the booking is already with", () => {
    expect(freeDoctorsForBooking(input())).not.toContain(ASTER_ID);
  });

  it("leaves out a doctor whose own hours don't cover the slot", () => {
    const morning = input({
      booking: { id: BOOKING_ID, practitionerId: ASTER_ID, localDate: "2026-10-08", localStart: "10:00", status: "booked", startsAt: at("10:00") },
      bookingsThatDay: [],
    });
    expect(freeDoctorsForBooking(morning)).toEqual([MEERA_ID]);
  });

  it("leaves out a doctor on leave that day", () => {
    const onLeave = input({
      schedules: [
        schedule(ASTER_ID, "Aster Physio"),
        schedule(RAHUL_ID, "Dr Rahul Menon", {
          usesClinicHours: false,
          hours: RAHUL_OWN_HOURS,
          leave: [{ id: "l1", startsOn: "2026-10-06", endsOn: "2026-10-08", note: "Conference" }],
        }),
      ],
    });
    expect(freeDoctorsForBooking(onLeave)).toEqual([]);
  });

  it("leaves out everyone on a clinic closure", () => {
    const closed = input({ closures: [{ startsOn: "2026-10-08", endsOn: "2026-10-08", note: "Holiday" }] });
    expect(freeDoctorsForBooking(closed)).toEqual([]);
  });

  it("leaves out a doctor with an overlapping booking, but not one whose booking was cancelled", () => {
    const busy = input({
      bookingsThatDay: [
        { id: BOOKING_ID, practitionerId: ASTER_ID, startsAt: at("15:00"), endsAt: at("15:30"), status: "booked" },
        { id: "b2", practitionerId: RAHUL_ID, startsAt: at("15:00"), endsAt: at("15:30"), status: "done" },
        { id: "b3", practitionerId: MEERA_ID, startsAt: at("15:00"), endsAt: at("15:30"), status: "cancelled" },
      ],
    });
    expect(freeDoctorsForBooking(busy)).toEqual([MEERA_ID]);
  });

  it("ignores the clinic's booking notice and horizon -- the clinic is rearranging its own diary", () => {
    const soon = input({ now: new Date(at("14:50").getTime()) });
    expect(freeDoctorsForBooking(soon)).toEqual([RAHUL_ID, MEERA_ID]);
    const farOff = input({ now: new Date("2025-10-05T04:30:00Z") });
    expect(freeDoctorsForBooking(farOff)).toEqual([RAHUL_ID, MEERA_ID]);
  });

  it("offers nobody for a booking that has already started", () => {
    expect(freeDoctorsForBooking(input({ now: at("15:00") }))).toEqual([]);
  });

  it("offers nobody for a booking that is no longer booked", () => {
    const done = input({
      booking: { id: BOOKING_ID, practitionerId: ASTER_ID, localDate: "2026-10-08", localStart: "15:00", status: "cancelled", startsAt: at("15:00") },
    });
    expect(freeDoctorsForBooking(done)).toEqual([]);
  });

  it("offers nobody when the booking starts off the clinic's current slot grid", () => {
    const offGrid = input({
      booking: { id: BOOKING_ID, practitionerId: ASTER_ID, localDate: "2026-10-08", localStart: "15:10", status: "booked", startsAt: at("15:10") },
    });
    expect(freeDoctorsForBooking(offGrid)).toEqual([]);
  });

  it("offers nobody rather than throwing for a slot length the engine doesn't publish", () => {
    expect(freeDoctorsForBooking(input({ slotMinutes: 25 }))).toEqual([]);
  });
});
