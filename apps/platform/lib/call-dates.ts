import { addDays, weekdayIndex } from "@brandbasket/shared/lib/calendar/local-date";
import { dayKey } from "@brandbasket/shared/lib/call-slots";

/** Where the team works: call times, promises and paid dates are all said in India's time. */
export const BRAND_TIME_ZONE = "Asia/Kolkata";

/** We start within 48 hours of the kickoff call (plan 28 section 3). */
const START_WITHIN_HOURS = 48;
/** The website's promise: live within 7 working days (brandbasket-website FAQ). */
const LIVE_WITHIN_WORKING_DAYS = 7;
const HOUR_MS = 3_600_000;

/** The two dates the first look promises, as `YYYY-MM-DD` in India. */
export interface PromiseDates {
  readonly startBy: string;
  readonly liveBy: string;
}

export function promiseDates(callStartIso: string): PromiseDates {
  const startBy = dayKey(new Date(Date.parse(callStartIso) + START_WITHIN_HOURS * HOUR_MS).toISOString(), BRAND_TIME_ZONE);
  return { startBy, liveBy: addWorkingDays(dayKey(callStartIso, BRAND_TIME_ZONE), LIVE_WITHIN_WORKING_DAYS) };
}

/** shortcut: Monday to Friday only, public holidays are not skipped; add a holiday list when the team publishes one. */
export function addWorkingDays(date: string, days: number): string {
  let day = date;
  let left = days;
  while (left > 0) {
    day = addDays(day, 1);
    if (weekdayIndex(day) < 5) left -= 1;
  }
  return day;
}

/** "Thu 5 Nov" for a `YYYY-MM-DD` date. */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** "Tue" for a slot's start, in India. */
export function slotDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: BRAND_TIME_ZONE }).format(new Date(iso));
}

/** "14:00" for a slot's start, in India. */
export function slotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: BRAND_TIME_ZONE }).format(new Date(iso));
}

/** "Tue 27 Oct, 14:00" for a slot's start, in India. */
export function slotLabel(iso: string): string {
  return `${shortDay(dayKey(iso, BRAND_TIME_ZONE))}, ${slotTime(iso)}`;
}

/** "26 Oct" for a moment, in India. */
export function dayMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: BRAND_TIME_ZONE }).format(date);
}
