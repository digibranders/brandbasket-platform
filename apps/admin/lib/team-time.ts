import { addDays, localDateIn, zonedTimeToUtc } from "@brandbasket/shared/lib/calendar/local-date";

/** The team works in India, so the console's days, clocks and greetings are India's. */
export const TEAM_TIME_ZONE = "Asia/Kolkata";

/** A stretch of time: `start` included, `end` excluded. */
export interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

function hourIn(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TEAM_TIME_ZONE }).format(now));
}

export function greeting(now: Date): string {
  const hour = hourIn(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Monday 30 November". */
export function longDay(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TEAM_TIME_ZONE }).format(date);
}

/** "30 Nov". */
export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TEAM_TIME_ZONE }).format(date);
}

/** "09:00". */
export function clock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TEAM_TIME_ZONE }).format(date);
}

/** Today in India, midnight to midnight. */
export function todayRange(now: Date): TimeRange {
  const day = localDateIn(TEAM_TIME_ZONE, now);
  return { start: zonedTimeToUtc(day, "00:00", TEAM_TIME_ZONE), end: zonedTimeToUtc(addDays(day, 1), "00:00", TEAM_TIME_ZONE) };
}

/** This month in India, from the first to the first of the next month. */
export function monthRange(now: Date): TimeRange {
  const day = localDateIn(TEAM_TIME_ZONE, now);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // Date.UTC takes a 0-based month, so the 1-based `month` is already the next month (and December rolls over).
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: zonedTimeToUtc(`${day.slice(0, 7)}-01`, "00:00", TEAM_TIME_ZONE), end: zonedTimeToUtc(next, "00:00", TEAM_TIME_ZONE) };
}
