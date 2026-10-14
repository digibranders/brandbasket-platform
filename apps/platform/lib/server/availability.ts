import { z } from "zod";
import type { BookingContext, SiteFacts } from "@fynix/db";
import { isIsoDate, localDateIn, mondayOf } from "@fynix/shared/lib/calendar/local-date";
import { buildClinicWeek, type PractitionerCalendar } from "@fynix/shared/lib/appointments/clinic-availability";
import type { SiteAvailability } from "@fynix/shared/lib/appointments/slots";
import { nowMinutesIn } from "./local-time";

/**
 * The pure decision and assembly logic behind `GET /api/site/availability`. Split in two because the route needs
 * to know the business's time zone and the requested week *before* it can fetch busy intervals from the database:
 *
 * 1. `resolveAvailabilityWindow` decides whether the request can proceed at all (module on, settings present,
 *    accepting bookings, a well-formed `week` param) and, if so, resolves the local week/today/nowMinutes the
 *    route then uses to compute the UTC range for `listBusyIntervals`.
 * 2. Once the route has loaded each practitioner's calendar for that range (`loadClinicCalendars`,
 *    ./clinic-calendars.ts), `buildAvailabilityResponse` hands everything to `buildClinicWeek` (packages/shared) to
 *    produce the merged `SiteAvailability` the endpoint returns.
 *
 * Both are pure and I/O-free, so this module has no `server-only` import and is exercised directly in tests.
 */

export const DEFAULT_PAUSED_MESSAGE = "Online booking is paused. Please call us.";

export type AvailabilityWindowOutcome =
  | { readonly kind: "unavailable" }
  | { readonly kind: "paused"; readonly message: string }
  | { readonly kind: "invalid_week" }
  | { readonly kind: "ok"; readonly window: AvailabilityWindow };

export interface AvailabilityWindow {
  readonly timeZone: string;
  /** The Monday of the requested week. */
  readonly weekStart: string;
  readonly today: string;
  readonly nowMinutes: number;
  readonly slotMinutes: number;
  readonly minNoticeMinutes: number;
  readonly horizonDays: number;
}

/**
 * Checks, in order: the module is on and has settings and a time zone (else `unavailable`); the business is
 * currently accepting bookings (else `paused`, with its message); `weekParam` — any date in the target week, or
 * null for the current week — is a well-formed ISO date (else `invalid_week`). Resolves `weekParam` to that week's
 * Monday and computes `today`/`nowMinutes` in the business's own time zone.
 */
export function resolveAvailabilityWindow(context: BookingContext, weekParam: string | null, now: Date): AvailabilityWindowOutcome {
  if (!context.enabled || context.timeZone === null || context.settings === null) {
    return { kind: "unavailable" };
  }
  if (!context.settings.accepting) {
    return { kind: "paused", message: context.settings.pausedMessage ?? DEFAULT_PAUSED_MESSAGE };
  }
  if (weekParam !== null && !isIsoDate(weekParam)) {
    return { kind: "invalid_week" };
  }

  const timeZone = context.timeZone;
  const today = localDateIn(timeZone, now);
  const weekStart = mondayOf(weekParam ?? today);
  const nowMinutes = nowMinutesIn(timeZone, now);

  return {
    kind: "ok",
    window: {
      timeZone,
      weekStart,
      today,
      nowMinutes,
      slotMinutes: context.settings.slotMinutes,
      minNoticeMinutes: context.settings.minNoticeMinutes,
      horizonDays: context.settings.horizonDays,
    },
  };
}

/** Assembles the final `SiteAvailability` once the route has loaded `facts` and the practitioners' calendars for
 * the week (`loadClinicCalendars`, ./clinic-calendars.ts) -- every active doctor's for "any doctor", or just the
 * chosen one's. Pure: all the actual slot/closure/notice rules live in `buildWeekAvailability`
 * (packages/shared/src/lib/appointments/slots.ts), and the per-doctor merge in `buildClinicWeek`
 * (clinic-availability.ts). No calendars (a clinic with no active doctor) means every day comes out closed. */
export function buildAvailabilityResponse(
  window: AvailabilityWindow,
  facts: SiteFacts,
  calendars: readonly PractitionerCalendar[],
): SiteAvailability {
  return buildClinicWeek({
    weekStart: window.weekStart,
    today: window.today,
    nowMinutes: window.nowMinutes,
    timeZone: window.timeZone,
    closures: facts.closures,
    slotMinutes: window.slotMinutes,
    minNoticeMinutes: window.minNoticeMinutes,
    horizonDays: window.horizonDays,
    practitioners: calendars,
  }).availability;
}

export type PractitionerParam =
  | { readonly kind: "any" }
  | { readonly kind: "one"; readonly id: string }
  | { readonly kind: "invalid" };

const uuidFormat = z.uuid();

/**
 * Reads the `practitioner` query param's shape: missing or blank is any doctor (the same reading
 * parseBookingFields gives a blank `practitionerId`, so a client site can send an empty select value either way), a
 * uuid is one doctor, anything else is invalid. Whether the uuid names an active doctor of this clinic is left to
 * the route, which has the list; checking the shape first keeps a malformed id away from the database entirely.
 */
export function parsePractitionerParam(raw: string | null): PractitionerParam {
  const value = (raw ?? "").trim();
  if (value === "") return { kind: "any" };
  return uuidFormat.safeParse(value).success ? { kind: "one", id: value } : { kind: "invalid" };
}
