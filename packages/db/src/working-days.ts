/** Where the team works: promises are said in India's time. */
export const WORKING_TIME_ZONE = "Asia/Kolkata";

/** After the customer asks for changes, the updated preview is promised this many working days later. */
export const REVISION_READY_WORKING_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** shortcut: Monday to Friday only, public holidays are not skipped. */
export function addWorkingDays(date: string, days: number): string {
  let day = date;
  let left = days;
  while (left > 0) {
    day = addDays(day, 1);
    if (weekdayIndex(day) < 5) left -= 1;
  }
  return day;
}

/** The day (YYYY-MM-DD, India) the updated preview is promised, for changes asked for on askedDay. */
export function revisionReadyDay(askedDay: string): string {
  return addWorkingDays(askedDay, REVISION_READY_WORKING_DAYS);
}

/** The India day (YYYY-MM-DD) a moment falls on. */
export function workingDayOf(moment: Date): string {
  return dayKey(moment.toISOString(), WORKING_TIME_ZONE);
}

/** Adds working days (Monday to Friday in India) to a moment, keeping the time of day. */
export function workingDaysAfter(now: Date, days: number): Date {
  let current = new Date(now.getTime());
  let left = days;
  while (left > 0) {
    current = new Date(current.getTime() + DAY_MS);
    const day = workingDayOf(current);
    if (weekdayIndex(day) < 5) left -= 1;
  }
  return current;
}

/** When an updated preview is promised for changes requested at now. */
export function revisionDueAt(now: Date): Date {
  return workingDaysAfter(now, REVISION_READY_WORKING_DAYS);
}

/** When an approved website is promised to be prepared and live after approval at now. */
export function approvedDueAt(now: Date): Date {
  return workingDaysAfter(now, 1);
}
