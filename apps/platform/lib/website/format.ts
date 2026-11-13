import { BRAND_TIME_ZONE } from "@/lib/call-dates";

/** The dates and numbers the Website page's health and visits panels say, in India's time with Indian digit grouping. */

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: BRAND_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const INTEGER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

const indiaDay = (date: Date): string => DAY_KEY.format(date);

/** `Tue 3 Nov`, with the year only when it is not this year. The locale's "Sept" is cut to three letters. */
export function formatDate(date: Date, now: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes): string => DAY.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const label = `${part("weekday")} ${part("day")} ${part("month").slice(0, 3)}`;
  const year = indiaDay(date).slice(0, 4);
  return year === indiaDay(now).slice(0, 4) ? label : `${label} ${year}`;
}

/** `Today, 10:42`, `Yesterday, 17:30`, then the date. */
export function formatRelative(date: Date, now: Date): string {
  const time = TIME.format(date);
  if (indiaDay(date) === indiaDay(now)) return `Today, ${time}`;
  if (indiaDay(date) === indiaDay(new Date(now.getTime() - 24 * 3_600_000))) return `Yesterday, ${time}`;
  return formatDate(date, now);
}

/** A count or measure with Indian grouping: `12,34,567`, `4.5`. */
export function formatNumber(value: number): string {
  return (Number.isInteger(value) ? INTEGER : DECIMAL).format(value);
}

/** A share already in percent: `12%`, `12.5%`. */
export function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

/** A change against the previous period in percent: `+12%`, `-3%`. */
export function formatChange(percent: number): string {
  return `${percent > 0 ? "+" : ""}${formatNumber(percent)}%`;
}
