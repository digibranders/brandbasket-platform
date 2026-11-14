import { formatMoney as formatSharedMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/*
 * Every number, amount, date and time a person reads goes through here (plan 60, section 12). Lint refuses Intl,
 * toFixed and toLocaleString anywhere else. Times are India time; the app labels that once where a time is picked.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const INTEGER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const SIGNED = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const LIST = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/**
 * An amount held in minor units (paise or cents): `₹30,398`, `$350`, with the decimals only when they are not zero. INR
 * prices include GST; nothing here adds or mentions tax. From the shared money module, so the app and email agree.
 */
export function formatMoney(minorUnits: number, currency: MoneyCurrency): string {
  return formatSharedMoney(minorUnits, currency);
}

/** The India calendar day of an instant, as YYYY-MM-DD. */
function dayKey(date: Date): string {
  return DAY_KEY.format(date);
}

/** `Tue 3 Nov`: the locale's short month is "Sept" for September, so the month is cut to three letters. */
function dayLabel(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes): string => DAY.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month").slice(0, 3)}`;
}

/** `Tue 3 Nov`, with the year only when it is not this year (in India). */
export function formatDate(date: Date, now: Date = new Date()): string {
  const year = dayKey(date).slice(0, 4);
  return year === dayKey(now).slice(0, 4) ? dayLabel(date) : `${dayLabel(date)} ${year}`;
}

/** `11:00`, India time, 24-hour. */
export function formatTime(date: Date): string {
  return TIME.format(date);
}

/** `Tue 3 Nov, 11:00`. */
export function formatDateTime(date: Date, now: Date = new Date()): string {
  return `${formatDate(date, now)}, ${formatTime(date)}`;
}

/** `Today, 10:42`, `Yesterday, 17:30`, then the date. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const day = dayKey(date);
  if (day === dayKey(now)) return `Today, ${formatTime(date)}`;
  if (day === dayKey(new Date(now.getTime() - 24 * 3_600_000))) return `Yesterday, ${formatTime(date)}`;
  return formatDate(date, now);
}

/** A count or measure with Indian grouping: `12,34,567`, `4.5`. */
export function formatNumber(value: number): string {
  return (Number.isInteger(value) ? INTEGER : DECIMAL).format(value);
}

/** `9 of 12`. */
export function formatOutOf(count: number, total: number): string {
  return `${formatNumber(count)} of ${formatNumber(total)}`;
}

/** Names joined for a sentence: `Website`, `Website and Social`, `Website, Social and Ads`. */
export function formatList(items: readonly string[]): string {
  return LIST.format(items);
}

/** A count with its unit: `1 visit`, `3 visits`. Pass the plural when it is not the singular plus "s". */
export function formatQuantity(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** A share already in percent: `12%`, `12.5%`. */
export function formatPercent(percent: number): string {
  return `${DECIMAL.format(percent)}%`;
}

/** A change against the previous period: `+9`, `-3`, `0`, or with `percent`, `+12%`. */
export function formatChange(change: number, unit: "count" | "percent" = "count"): string {
  return `${SIGNED.format(change)}${unit === "percent" ? "%" : ""}`;
}

/** A change of search position, where a smaller number is better: moving from 8 to 5 is `↑3`. */
export function formatRankChange(previous: number, current: number): string {
  const moved = previous - current;
  if (moved === 0) return "0";
  return `${moved > 0 ? "↑" : "↓"}${formatNumber(Math.abs(moved))}`;
}

const BYTE_UNITS = ["bytes", "KB", "MB", "GB"] as const;

/** A file size for upload limits and file lists: `512 bytes`, `4 MB`, `1.5 GB`. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${DECIMAL.format(value)} ${BYTE_UNITS[unit]}`;
}
