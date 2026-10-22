import { formatCalendarDate } from "@brandbasket/shared/lib/format";

/** Dates on the Services page are said in India time: the business and the team both work in it. */
const INDIA_TIME = "Asia/Kolkata";

/** A date as the page says it: "12 November 2026". */
export function addOnDate(date: Date): string {
  return formatCalendarDate(date, INDIA_TIME);
}

/** Said instead of an Add or Remove while a kept plan waits to start: the subscription it carries on from is cancelled at the provider. */
export function planStartsAgain(startsOn: Date): string {
  return `Your plan starts again on ${addOnDate(startsOn)}. You can change your services from then.`;
}
