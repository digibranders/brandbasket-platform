/**
 * The months a monthly report covers. A report month is a calendar month in India (IST, a fixed +05:30 with no daylight
 * saving), because the customers, the invoices and the people reading the report are there. A month is named by its key,
 * "2026-10".
 */
export type MonthKey = `${number}-${number}`;

/** India Standard Time, in milliseconds ahead of UTC. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export interface MonthRange {
  readonly key: MonthKey;
  /** The first day, as YYYY-MM-DD. */
  readonly start: string;
  /** The last day, as YYYY-MM-DD. */
  readonly end: string;
  readonly days: number;
  readonly name: string;
  readonly year: number;
}

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const pad = (value: number): string => String(value).padStart(2, "0");
const keyOf = (year: number, month: number): MonthKey => `${year}-${pad(month)}` as MonthKey;

/** The key for a text like "2026-10", or null when it is not a real month. */
export function parseMonthKey(text: string): MonthKey | null {
  return KEY.test(text) ? (text as MonthKey) : null;
}

function partsOf(key: MonthKey): { readonly year: number; readonly month: number } {
  const match = KEY.exec(key);
  if (match === null) throw new RangeError(`Not a month key: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The Indian calendar month a moment falls in. */
export function monthKeyOf(date: Date): MonthKey {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return keyOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

export function previousMonthKey(key: MonthKey): MonthKey {
  const { year, month } = partsOf(key);
  return month === 1 ? keyOf(year - 1, 12) : keyOf(year, month - 1);
}

export function nextMonthKey(key: MonthKey): MonthKey {
  const { year, month } = partsOf(key);
  return month === 12 ? keyOf(year + 1, 1) : keyOf(year, month + 1);
}

/** The month a report written at this moment is about: the last one that has ended. */
export function lastFullMonth(now: Date): MonthKey {
  return previousMonthKey(monthKeyOf(now));
}

export function monthName(key: MonthKey): string {
  return MONTH_NAMES[partsOf(key).month - 1] as string;
}

export function monthRange(key: MonthKey): MonthRange {
  const { year, month } = partsOf(key);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key, start: `${key}-01`, end: `${key}-${pad(days)}`, days, name: monthName(key), year };
}
