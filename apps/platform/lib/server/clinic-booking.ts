import "server-only";
import { readBookingContext, readSiteFacts, type AppointmentSettingsRow, type BookingContext, type Database, type SiteFacts } from "@fynix/db";
import { buildClinicWeek, freePractitionersAt, type ClinicWeek, type PractitionerCalendar } from "@fynix/shared/lib/appointments/clinic-availability";
import { findSlot, type SiteSlotState } from "@fynix/shared/lib/appointments/slots";
import { addDays, localDateIn, mondayOf, zonedTimeToUtc } from "@fynix/shared/lib/calendar/local-date";
import { loadClinicCalendars } from "./clinic-calendars";
import { getStaffDb } from "./db";
import { nowMinutesIn } from "./local-time";

/**
 * Reception's Add booking: which times a clinic can book by hand on one day, and whether one requested time is still
 * bookable, and with which doctors. The same engine the public site uses (`buildClinicWeek` + `findSlot` +
 * `freePractitionersAt`, packages/shared/src/lib/appointments/) so hours, closures, leave, the slot grid and existing
 * bookings are read by exactly one set of rules; only two settings differ, because reception books deliberately:
 *
 * - no minimum notice (a walk-in can be booked into the slot that starts right now, just never into one already
 *   under way), and
 * - a fixed 180-day window instead of the clinic's online window (a follow-up in three months is routine at the desk
 *   even when the website only offers the next four weeks).
 *
 * The pause switch is not read here at all: bookSlot's `ignorePause` covers it. The module itself must be on.
 *
 * Split like availability.ts and clinic-calendars.ts: `buildClinicDay` and `resolveClinicSlot` are pure and unit
 * tested; `loadClinicDay` and `loadClinicSlot` add the reads, on the staff connection -- a sanctioned exception (see
 * `getStaffDb` in ./db.ts), since the customer's own role can't read other doctors' bookings through row-level
 * security in the one shape `buildClinicWeek` needs. The `businessId` every loader takes must come from the caller's
 * verified session (`requireCustomerAccess` / `paidCustomerOrNull`), never from the request.
 */

/** How far ahead reception may book, in days counted from today (today is day 1, as with the online window). */
export const RECEPTION_HORIZON_DAYS = 180;

/** The last date reception may book: today plus `RECEPTION_HORIZON_DAYS - 1`, the same arithmetic
 * `buildWeekAvailability` uses for its own window, so a date this allows is never closed by the horizon. */
export function lastReceptionDate(today: string): string {
  return addDays(today, RECEPTION_HORIZON_DAYS - 1);
}

export type ReceptionDateCheck = "ok" | "past" | "too_far";

/** Whether `date` (YYYY-MM-DD) is one reception may open at all, given the business-local `today`. */
export function checkReceptionDate(date: string, today: string): ReceptionDateCheck {
  if (date < today) return "past";
  if (date > lastReceptionDate(today)) return "too_far";
  return "ok";
}

export interface ClinicDaySlot {
  readonly start: string; // "HH:MM"
  readonly end: string; // "HH:MM"
  readonly state: SiteSlotState;
  /** The doctors free for this slot, in display order: bookSlot's candidates. Empty unless `state` is `free`. */
  readonly freePractitionerIds: readonly string[];
}

export interface ClinicDayInput {
  readonly context: BookingContext;
  readonly facts: SiteFacts;
  /** One per active practitioner, in display order: loadClinicCalendars with `onlyPractitionerId: null`. The chosen
   * doctor is picked out here, not by the loader, so an id that names no active doctor can be told apart from a day
   * that simply has nothing free. */
  readonly calendars: readonly PractitionerCalendar[];
  readonly date: string;
  /** A doctor's id, or null for any doctor. */
  readonly practitionerId: string | null;
  readonly now: Date;
}

export type ClinicDay =
  /** The module is off, or was never fully set up (no time zone or no settings). */
  | { readonly kind: "unavailable" }
  /** `practitionerId` is not one of the business's active doctors. */
  | { readonly kind: "doctor_not_found" }
  /** Every slot the day has, whatever its state; empty when the day is closed. */
  | { readonly kind: "ready"; readonly slots: readonly ClinicDaySlot[] };

interface ReadyContext {
  readonly timeZone: string;
  readonly settings: AppointmentSettingsRow;
}

function readyContext(context: BookingContext): ReadyContext | null {
  if (!context.enabled || context.timeZone === null || context.settings === null) return null;
  return { timeZone: context.timeZone, settings: context.settings };
}

/** The calendars a request considers: every active doctor's for any doctor, or the chosen one's alone; null when the
 * chosen id is not among them. */
function consideredCalendars(calendars: readonly PractitionerCalendar[], practitionerId: string | null): readonly PractitionerCalendar[] | null {
  if (practitionerId === null) return calendars;
  const chosen = calendars.filter((calendar) => calendar.id === practitionerId);
  return chosen.length === 0 ? null : chosen;
}

/** The clinic week containing `date` under reception's rules. The clinic's own settings are left untouched: only the
 * slot length is read from them, and notice and window are passed as reception's own values. */
function receptionWeek(ready: ReadyContext, facts: SiteFacts, calendars: readonly PractitionerCalendar[], date: string, now: Date): ClinicWeek {
  return buildClinicWeek({
    weekStart: mondayOf(date),
    today: localDateIn(ready.timeZone, now),
    nowMinutes: nowMinutesIn(ready.timeZone, now),
    timeZone: ready.timeZone,
    closures: facts.closures,
    slotMinutes: ready.settings.slotMinutes,
    minNoticeMinutes: 0,
    horizonDays: RECEPTION_HORIZON_DAYS,
    practitioners: calendars,
  });
}

/** Pure. Every slot on `input.date` with its state, and for each free one, the doctors free for it. */
export function buildClinicDay(input: ClinicDayInput): ClinicDay {
  const ready = readyContext(input.context);
  if (ready === null) return { kind: "unavailable" };
  const calendars = consideredCalendars(input.calendars, input.practitionerId);
  if (calendars === null) return { kind: "doctor_not_found" };

  const week = receptionWeek(ready, input.facts, calendars, input.date, input.now);
  const day = week.availability.days.find((candidate) => candidate.date === input.date);
  if (day === undefined || day.closed) return { kind: "ready", slots: [] };
  return {
    kind: "ready",
    slots: day.slots.map((slot) => ({ ...slot, freePractitionerIds: freePractitionersAt(week, input.date, slot.start) })),
  };
}

export type ClinicSlotResolution =
  | {
      readonly kind: "free";
      readonly start: string;
      readonly end: string;
      /** The slot as UTC instants in the business's time zone, for bookSlot's `startsAt`/`endsAt`. */
      readonly startsAt: Date;
      readonly endsAt: Date;
      /** bookSlot's candidates: the chosen doctor alone, or every doctor free then for any doctor. Never empty. */
      readonly practitionerIds: readonly string[];
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "doctor_not_found" }
  /** Not on the day's grid: a closed day, a time off the slot grid, outside working hours, or beyond the window. */
  | { readonly kind: "closed" }
  /** Already started (or on a day before today). */
  | { readonly kind: "past" }
  /** Every doctor considered is booked then. */
  | { readonly kind: "taken" };

/** Pure. Whether `start` on `input.date` can be booked by reception right now, and with whom. */
export function resolveClinicSlot(input: ClinicDayInput & { readonly start: string }): ClinicSlotResolution {
  const ready = readyContext(input.context);
  if (ready === null) return { kind: "unavailable" };
  const calendars = consideredCalendars(input.calendars, input.practitionerId);
  if (calendars === null) return { kind: "doctor_not_found" };

  const week = receptionWeek(ready, input.facts, calendars, input.date, input.now);
  const slot = findSlot(week.availability, input.date, input.start);
  if (slot === null) return { kind: "closed" };
  if (slot.state === "past") return { kind: "past" };
  const practitionerIds = freePractitionersAt(week, input.date, slot.start);
  if (slot.state === "taken" || practitionerIds.length === 0) return { kind: "taken" };
  return {
    kind: "free",
    start: slot.start,
    end: slot.end,
    startsAt: zonedTimeToUtc(input.date, slot.start, ready.timeZone),
    // zonedTimeToUtc reads "24:00" as the end of the day, so a slot ending at midnight converts correctly.
    endsAt: zonedTimeToUtc(input.date, slot.end, ready.timeZone),
    practitionerIds,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Loaders (staff connection)
// ---------------------------------------------------------------------------------------------------------------

interface DayReads {
  readonly facts: SiteFacts;
  readonly calendars: readonly PractitionerCalendar[];
}

/** The clinic's facts and every active doctor's calendar for one local day: its bookings from local midnight to the
 * next local midnight, the same bounds booking-confirm.ts reads a day by. */
async function readDay(db: Database, businessId: string, timeZone: string, date: string): Promise<DayReads> {
  const facts = await readSiteFacts(db, businessId);
  const { calendars } = await loadClinicCalendars(db, businessId, {
    clinicHours: facts.hours,
    timeZone,
    fromUtc: zonedTimeToUtc(date, "00:00", timeZone),
    toUtc: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone),
    onlyPractitionerId: null,
  });
  return { facts, calendars };
}

export type LoadedClinicDay =
  | { readonly kind: "unavailable" }
  | { readonly kind: "out_of_range"; readonly today: string; readonly date: string; readonly reason: "past" | "too_far" }
  | { readonly kind: "doctor_not_found"; readonly today: string; readonly date: string }
  | { readonly kind: "ready"; readonly today: string; readonly date: string; readonly slots: readonly ClinicDaySlot[] };

/**
 * The Add booking page's day: `date` (null for the business-local today) with every slot and who is free for each.
 * A date before today or past the 180-day window is refused before any calendar is read. `businessId` must be the
 * signed-in customer's own (see the module doc comment).
 */
export async function loadClinicDay(businessId: string, date: string | null, practitionerId: string | null, now: Date): Promise<LoadedClinicDay> {
  const db = getStaffDb();
  const context = await readBookingContext(db, businessId);
  const ready = readyContext(context);
  if (ready === null) return { kind: "unavailable" };

  const today = localDateIn(ready.timeZone, now);
  const day = date ?? today;
  const check = checkReceptionDate(day, today);
  if (check !== "ok") return { kind: "out_of_range", today, date: day, reason: check };

  const { facts, calendars } = await readDay(db, businessId, ready.timeZone, day);
  const built = buildClinicDay({ context, facts, calendars, date: day, practitionerId, now });
  if (built.kind === "unavailable") return built;
  if (built.kind === "doctor_not_found") return { kind: "doctor_not_found", today, date: day };
  return { kind: "ready", today, date: day, slots: built.slots };
}

/**
 * The Add booking action's re-check of the one slot it was sent: always read fresh here, never trusted from the
 * page, because a booking, a closure or a doctor's leave can land between the page rendering and the submit. The
 * free doctors it returns are bookSlot's candidates; bookSlot's own lock and overlap check still decide the race.
 */
export async function loadClinicSlot(
  businessId: string,
  date: string,
  start: string,
  practitionerId: string | null,
  now: Date,
): Promise<ClinicSlotResolution> {
  const db = getStaffDb();
  const context = await readBookingContext(db, businessId);
  const ready = readyContext(context);
  if (ready === null) return { kind: "unavailable" };

  const { facts, calendars } = await readDay(db, businessId, ready.timeZone, date);
  return resolveClinicSlot({ context, facts, calendars, date, practitionerId, now, start });
}
