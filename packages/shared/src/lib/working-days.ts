import { addDays, weekdayIndex } from "./calendar/local-date";
import { dayKey } from "./call-slots";

/** Where the team works: promises are said in India's time. */
export const WORKING_TIME_ZONE = "Asia/Kolkata";

/** After the customer asks for changes, the updated preview is promised this many working days later. */
export const REVISION_READY_WORKING_DAYS = 2;

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

/** The day (`YYYY-MM-DD`, India) the updated preview is promised, for changes asked for on `askedDay`. The customer's Website page and the console share it. */
export function revisionReadyDay(askedDay: string): string {
  return addWorkingDays(askedDay, REVISION_READY_WORKING_DAYS);
}

/** The India day (`YYYY-MM-DD`) a moment falls on. */
export function workingDayOf(moment: Date): string {
  return dayKey(moment.toISOString(), WORKING_TIME_ZONE);
}
