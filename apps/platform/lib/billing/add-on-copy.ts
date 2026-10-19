import { formatCalendarDate } from "@brandbasket/shared/lib/format";

/** Dates on the Add-ons page are said in India time: the business and the team both work in it. */
const INDIA_TIME = "Asia/Kolkata";

/** A date as the page says it: "12 November 2026". */
export function addOnDate(date: Date): string {
  return formatCalendarDate(date, INDIA_TIME);
}
