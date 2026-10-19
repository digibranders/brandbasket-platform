import {
  listBusyIntervals,
  readPractitionerSchedules,
  type BusyInterval,
  type Database,
  type PractitionerScheduleRow,
} from "@brandbasket/db";
import type { PractitionerCalendar } from "@brandbasket/shared/lib/appointments/clinic-availability";
import type { WeekAvailabilityHoursRow } from "@brandbasket/shared/lib/appointments/slots";
import { utcIntervalToLocal } from "./local-time";

/**
 * Turns what the database knows about a clinic's doctors into the per-doctor calendars `buildClinicWeek`
 * (packages/shared/src/lib/appointments/clinic-availability.ts) takes. Shared by every site route that asks "is this
 * slot free, and with whom" -- availability, the OTP request and the confirm -- so all three read a doctor's hours,
 * leave and bookings through exactly one set of rules and can never disagree about who is free.
 *
 * Split in two, like availability.ts: `buildPractitionerCalendars` is the pure grouping and resolving, unit tested
 * directly; `loadClinicCalendars` only adds the two reads. The loader takes the database handle as an argument
 * rather than calling getStaffDb itself, so this module has no `server-only` import and its callers keep choosing
 * the connection, as they already do for every other read.
 */

export interface ClinicCalendars {
  /** Every active practitioner, in display order, whether or not their calendar was kept -- callers check a chosen
   * id against it and read a booked doctor's name from it. */
  readonly practitioners: readonly PractitionerScheduleRow[];
  /** One per practitioner considered: all of them, or only the chosen one. Same order as `practitioners`. */
  readonly calendars: readonly PractitionerCalendar[];
}

export interface BuildPractitionerCalendarsInput {
  readonly schedules: readonly PractitionerScheduleRow[];
  /** UTC intervals from listBusyIntervals, each tagged with its practitioner. */
  readonly busy: readonly BusyInterval[];
  /** The clinic's own weekly hours (SiteFacts.hours), for every practitioner on clinic hours. */
  readonly clinicHours: readonly WeekAvailabilityHoursRow[];
  readonly timeZone: string;
  /** Keep only this practitioner's calendar (a patient who picked a doctor); null keeps everyone's (any doctor). An
   * id that is not an active practitioner keeps nobody's, so the week comes out closed rather than wrong. */
  readonly onlyPractitionerId: string | null;
}

/**
 * Pure. Groups the busy intervals by practitioner and converts each to local time, and resolves each practitioner's
 * hours: the clinic's when they use clinic hours (their own list is always empty then), else their own. A busy
 * interval whose practitioner is not among `schedules` -- a booking with a doctor since archived -- blocks nobody:
 * that doctor takes no new bookings, and their old one does not occupy anyone else's calendar.
 */
export function buildPractitionerCalendars(input: BuildPractitionerCalendarsInput): ClinicCalendars {
  const busyBy = new Map<string, PractitionerCalendar["busy"][number][]>();
  for (const interval of input.busy) {
    const list = busyBy.get(interval.practitionerId) ?? [];
    list.push(utcIntervalToLocal(interval, input.timeZone));
    busyBy.set(interval.practitionerId, list);
  }

  const considered =
    input.onlyPractitionerId === null ? input.schedules : input.schedules.filter((schedule) => schedule.id === input.onlyPractitionerId);

  const calendars = considered.map(
    (schedule): PractitionerCalendar => ({
      id: schedule.id,
      hours: schedule.usesClinicHours ? input.clinicHours : schedule.hours,
      leave: schedule.leave,
      busy: busyBy.get(schedule.id) ?? [],
    }),
  );
  return { practitioners: input.schedules, calendars };
}

export interface LoadClinicCalendarsOptions {
  readonly clinicHours: readonly WeekAvailabilityHoursRow[];
  readonly timeZone: string;
  /** The UTC range whose bookings matter, [fromUtc, toUtc): the requested week or day, local midnight to midnight. */
  readonly fromUtc: Date;
  readonly toUtc: Date;
  readonly onlyPractitionerId: string | null;
}

/** Reads `businessId`'s active practitioners and the range's bookings (in parallel), then builds their calendars.
 * Use with the staff connection: both reads are system reads, like readSiteFacts and readBookingContext. */
export async function loadClinicCalendars(db: Database, businessId: string, options: LoadClinicCalendarsOptions): Promise<ClinicCalendars> {
  const [schedules, busy] = await Promise.all([
    readPractitionerSchedules(db, businessId),
    listBusyIntervals(db, businessId, options.fromUtc, options.toUtc),
  ]);
  return buildPractitionerCalendars({
    schedules,
    busy,
    clinicHours: options.clinicHours,
    timeZone: options.timeZone,
    onlyPractitionerId: options.onlyPractitionerId,
  });
}
