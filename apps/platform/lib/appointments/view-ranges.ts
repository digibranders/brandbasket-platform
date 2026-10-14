/**
 * Pure date maths for the appointments page's Month view (and Custom, which shares its grouped-list rendering):
 * a month's own first/last day, stepping a month back or forward, and grouping a date-ordered list of rows by the
 * calendar date they fall on. Day maths (previous/next/today) needs nothing of its own -- `addDays` from
 * @fynix/shared's calendar/local-date.ts already covers it.
 */
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** True for a real "YYYY-MM" month, year limited to 2000-2100 the same way @fynix/shared's isIsoDate limits a
 * calendar date -- outside that range is a typo to fall back from, not a valid (if unlikely) month. */
export function isIsoMonth(value: string): boolean {
  const match = MONTH_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

interface MonthParts {
  readonly year: number;
  /** 0-11, a plain JS Date month index -- kept internal; every public function here still speaks "YYYY-MM". */
  readonly monthIndex: number;
}

/** `value` must already be a real "YYYY-MM" month (see isIsoMonth); this does not validate it. */
function monthParts(value: string): MonthParts {
  const match = MONTH_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Expected a YYYY-MM month, received ${value}`);
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

function formatMonth(year: number, monthIndex: number): string {
  return `${String(year)}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export interface DateRange {
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD
}

/** The first and last calendar day of `month`, e.g. monthRange("2026-09") -> {from: "2026-09-01", to: "2026-09-30"}. */
export function monthRange(month: string): DateRange {
  const { year, monthIndex } = monthParts(month);
  const from = `${formatMonth(year, monthIndex)}-01`;
  // Day 0 of "next month" is the last day of this one -- a plain, DST-free way to ask a Date how long a month is.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const to = `${formatMonth(year, monthIndex)}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** `month` shifted by `delta` whole months (negative to go back), e.g. shiftMonth("2026-01", -1) -> "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = monthParts(month);
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1));
  return formatMonth(shifted.getUTCFullYear(), shifted.getUTCMonth());
}

export interface DateGroup<T> {
  readonly date: string; // YYYY-MM-DD
  readonly rows: readonly T[];
}

/**
 * Splits an already date-ordered list into consecutive runs sharing the same `localDate` -- for the Month and
 * Custom views' "one hairline-separated heading per date" layout. Relies on the input already being sorted by
 * date (as listAppointmentsForDates returns it); this does not sort, so out-of-order input produces more, smaller
 * groups rather than merging same-date rows that aren't adjacent.
 */
export function groupByDate<T extends { readonly localDate: string }>(rows: readonly T[]): readonly DateGroup<T>[] {
  const groups: Array<{ date: string; rows: T[] }> = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last !== undefined && last.date === row.localDate) last.rows.push(row);
    else groups.push({ date: row.localDate, rows: [row] });
  }
  return groups;
}

/**
 * Each row's 1-based position in `rows`, keyed by id -- the appointments list's "Sr no" column and its
 * aria-label's "Booking N of total" prefix both read a row's number from this, by id, rather than the list's own
 * render order: that's what lets numbering stay continuous 1..length across groupByDate's date groups instead of
 * restarting at each one, whether or not the list is actually grouped for display.
 */
export function serialNumbersById(rows: readonly { readonly id: string }[]): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  rows.forEach((row, index) => numbers.set(row.id, index + 1));
  return numbers;
}
