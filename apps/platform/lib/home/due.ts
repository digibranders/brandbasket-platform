import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";

/** A promised date the customer is shown only while it is still ahead: once it passes, the page falls back to the line that names no date rather than promise a day that is gone. */
export function stillAhead(due: Date | null, now: Date): Date | null {
  return due !== null && due.getTime() > now.getTime() ? due : null;
}

/** The same rule for a promised day (`YYYY-MM-DD`, India): it holds through the whole of that day and is dropped from the next one. */
export function dayStillAhead(day: string | null, now: Date): string | null {
  return day !== null && day >= dayKey(now.toISOString(), BRAND_TIME_ZONE) ? day : null;
}
