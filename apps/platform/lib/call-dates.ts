import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { addWorkingDays } from "@brandbasket/shared/lib/working-days";

export { addWorkingDays };

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

/** "Thu 5 Nov" for a `YYYY-MM-DD` date. */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** "Tue" for a slot's start, in India. */
export function slotDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: BRAND_TIME_ZONE }).format(new Date(iso));
}

/** "2:00 pm" for a slot's start, in India. */
export function slotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: BRAND_TIME_ZONE }).format(new Date(iso));
}

/** The hour of a slot's start on a 24 hour clock (0 to 23), in India: for splitting a day at noon. */
export function slotHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: BRAND_TIME_ZONE }).format(new Date(iso)));
}

/** "Tue 27 Oct, 2:00 pm" for a slot's start, in India. */
export function slotLabel(iso: string): string {
  return `${shortDay(dayKey(iso, BRAND_TIME_ZONE))}, ${slotTime(iso)}`;
}

/** "26 Oct" for a moment, in India. */
export function dayMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: BRAND_TIME_ZONE }).format(date);
}
