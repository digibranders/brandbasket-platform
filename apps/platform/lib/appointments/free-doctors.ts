/**
 * "Which other doctors could take this booking instead?" -- the appointments page's Reassign control lists exactly
 * these, and the reassign action re-asks the same question before it moves anything (a select's options are just
 * what the page offered; the submitted id is never trusted on that basis alone). Pure and I/O-free: the caller
 * reads everything through the tenant-scoped connection (lib/server/free-doctors.ts) and hands it in.
 *
 * It runs the same engine the website's booking flow does -- `buildPractitionerCalendars` (lib/server/
 * clinic-calendars.ts) to resolve each doctor's hours and group their bookings, then `buildClinicWeek` and
 * `freePractitionersAt` (packages/shared) -- so "free" here means exactly what it means to a patient picking a
 * doctor: working then per their resolved hours (the clinic's, or their own), not on a clinic closure or their own
 * leave, and no overlapping booking that isn't cancelled. Only two rules differ, both deliberately: the clinic's
 * minimum notice and booking horizon are for patients booking themselves, not for a clinic rearranging its own
 * diary, so notice is zero and the horizon always reaches the booking's date.
 */
import type { AppointmentRow, PractitionerScheduleRow } from "@firstfold/db";
import { buildClinicWeek, freePractitionersAt } from "@firstfold/shared/lib/appointments/clinic-availability";
import { isSlotMinutes, type WeekAvailabilityClosure, type WeekAvailabilityHoursRow } from "@firstfold/shared/lib/appointments/slots";
import { localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { buildPractitionerCalendars } from "@/lib/server/clinic-calendars";
import { nowMinutesIn } from "@/lib/server/local-time";

export interface FreeDoctorsInput {
  readonly booking: Pick<AppointmentRow, "id" | "practitionerId" | "localDate" | "localStart" | "status" | "startsAt">;
  /** Every active doctor, in display order -- the order the result keeps. */
  readonly schedules: readonly PractitionerScheduleRow[];
  readonly clinicHours: readonly WeekAvailabilityHoursRow[];
  readonly closures: readonly WeekAvailabilityClosure[];
  /** Every booking on the booking's local date, any status and any doctor; cancelled ones are dropped here. */
  readonly bookingsThatDay: readonly Pick<AppointmentRow, "id" | "practitionerId" | "startsAt" | "endsAt" | "status">[];
  readonly timeZone: string;
  readonly slotMinutes: number;
  readonly now: Date;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD -- the same date-string-only arithmetic view-params.ts uses. */
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * The ids of every active doctor other than the booking's own who is free for its exact slot, in display order.
 * Empty -- never an error -- when there is nothing to offer: the booking isn't `booked` or has already started
 * (reassignAppointment refuses both too), it starts off the clinic's current slot grid (its slot length changed
 * since it was made, so no doctor has a slot starting then), or the stored slot length isn't one the engine
 * publishes (buildWeekAvailability would throw on it; a Reassign control silently absent is the better failure for a
 * page that is otherwise fine).
 */
export function freeDoctorsForBooking(input: FreeDoctorsInput): readonly string[] {
  const { booking, timeZone, now } = input;
  if (booking.status !== "booked" || booking.startsAt.getTime() <= now.getTime()) return [];
  if (!isSlotMinutes(input.slotMinutes)) return [];

  const { calendars } = buildPractitionerCalendars({
    schedules: input.schedules,
    busy: input.bookingsThatDay
      .filter((other) => other.status !== "cancelled")
      .map((other) => ({ startsAt: other.startsAt, endsAt: other.endsAt, practitionerId: other.practitionerId })),
    clinicHours: input.clinicHours,
    timeZone,
    onlyPractitionerId: null,
  });

  const today = localDateIn(timeZone, now);
  const week = buildClinicWeek({
    weekStart: booking.localDate,
    today,
    nowMinutes: nowMinutesIn(timeZone, now),
    timeZone,
    closures: input.closures,
    slotMinutes: input.slotMinutes,
    minNoticeMinutes: 0,
    horizonDays: Math.max(1, daysBetween(today, booking.localDate) + 1),
    practitioners: calendars,
  });

  return freePractitionersAt(week, booking.localDate, booking.localStart).filter((id) => id !== booking.practitionerId);
}
