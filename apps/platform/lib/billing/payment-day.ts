import { BRAND_TIME_ZONE } from "@/lib/call-dates";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BRAND_TIME_ZONE });
const YEAR = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: BRAND_TIME_ZONE });

/** "Thu 19 Nov" in India, with the year ("Thu 11 Nov 2027") only when it is not this year. */
export function formatPaymentDay(date: Date, now: Date): string {
  const day = DAY.format(date).replace(",", "");
  return YEAR.format(date) === YEAR.format(now) ? day : `${day} ${YEAR.format(date)}`;
}
