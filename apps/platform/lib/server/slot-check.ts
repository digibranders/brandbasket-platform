import type { BookingContext, SiteFacts } from "@firstfold/db";
import { buildClinicWeek, freePractitionersAt, type PractitionerCalendar } from "@firstfold/shared/lib/appointments/clinic-availability";
import { findSlot, type SiteSlot } from "@firstfold/shared/lib/appointments/slots";
import { localDateIn, mondayOf } from "@firstfold/shared/lib/calendar/local-date";
import { nowMinutesIn } from "./local-time";

export interface ResolvedSlot {
  readonly slot: SiteSlot;
  /** The doctors who could take this slot, in the calendars' (display) order: bookSlot's candidates. Empty unless
   * `slot.state` is `free`. */
  readonly freePractitionerIds: readonly string[];
}

/**
 * The one place a requested `date`/`start` is resolved against a business's current closures, booking window and
 * doctors' calendars (via `buildClinicWeek` + `findSlot` + `freePractitionersAt`,
 * packages/shared/src/lib/appointments/) — used both by `requestBookingOtp` (booking-otp.ts), when a visitor first
 * asks for a slot, and by `confirmBookingOtp` (booking-confirm.ts), which re-runs this same check for the OTP
 * payload's own date/start before it verifies the code: hours can be shortened, a closure or a doctor's leave can
 * be added, or the booking window can shrink in the minutes between those two requests, and none of that is caught
 * by `bookSlot`'s own re-check (module/accepting and a plain overlap check only). One function, reused rather than
 * re-implemented, means the two steps can never quietly drift onto different rules for the same question ("is this
 * slot actually bookable right now, and with whom?").
 *
 * Pure and I/O-free, like availability.ts's buildAvailabilityResponse: the caller has already loaded
 * `context`/`facts` and the relevant day's `calendars` (loadClinicCalendars, ./clinic-calendars.ts) -- every active
 * doctor's for "any doctor", or only the chosen one's. Returns null when `context.timeZone` or `context.settings`
 * is not yet set (the module was never turned on with a full setup) or when `findSlot` itself can't place the
 * request on the grid (closed day for every doctor considered, misaligned time, outside the window) -- the caller
 * decides what null and each `SiteSlot.state` mean for its own response.
 */
export function resolveRequestedSlot(
  context: BookingContext,
  facts: SiteFacts,
  calendars: readonly PractitionerCalendar[],
  date: string,
  start: string,
  now: Date,
): ResolvedSlot | null {
  if (context.timeZone === null || context.settings === null) return null;
  const timeZone = context.timeZone;

  const week = buildClinicWeek({
    weekStart: mondayOf(date),
    today: localDateIn(timeZone, now),
    nowMinutes: nowMinutesIn(timeZone, now),
    timeZone,
    closures: facts.closures,
    slotMinutes: context.settings.slotMinutes,
    minNoticeMinutes: context.settings.minNoticeMinutes,
    horizonDays: context.settings.horizonDays,
    practitioners: calendars,
  });
  const slot = findSlot(week.availability, date, start);
  if (slot === null) return null;
  return { slot, freePractitionerIds: freePractitionersAt(week, date, start) };
}
