import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";

/** The India calendar day of an instant, `YYYY-MM-DD`: the unit every promised date on the Website page is counted in. */
export function dayOf(date: Date): string {
  return dayKey(date.toISOString(), APP_TIME_ZONE);
}

/** `Thu 5 Nov` for a `YYYY-MM-DD` day. Promised dates are days ahead, so the year is never written. */
export function dayLabel(day: string): string {
  const noon = new Date(`${day}T12:00:00+05:30`);
  return formatDate(noon, noon);
}

/** A promised moment the customer is shown only while it is still ahead; once it passes the page names no date. */
export function stillAhead(due: Date | null, now: Date): Date | null {
  return due !== null && due.getTime() > now.getTime() ? due : null;
}

/** The same rule for a promised day: it holds through the whole of that day in India and is dropped from the next. */
export function dayStillAhead(day: string | null, now: Date): string | null {
  return day !== null && day >= dayOf(now) ? day : null;
}
