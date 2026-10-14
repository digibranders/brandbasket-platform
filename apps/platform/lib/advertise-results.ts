import type { AdDayCount, DirectoryAdPlacement } from "@fynix/db";

/*
 * Who saw and clicked an advertiser's ads, worked out from the platform's daily counts (directory_ad_daily_counts).
 * One "ad" is one placement for one week (a booking), so its figures are that placement's counts over the week's seven
 * days. "All ads" is every placement over the recent days. Pure, so it is tested without a database. "Seen" is people,
 * once a day each, not page loads: the platform counts a visitor once per ad, placement and day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A placement booked for one week, from a paid win or a staff placement. */
export interface AdBooking {
  readonly placement: DirectoryAdPlacement;
  /** The Monday the booking starts, `YYYY-MM-DD`. */
  readonly weekStart: string;
}

export interface Tally {
  /** People who saw the ad, summed over the days (a person back on another day counts again). */
  readonly seen: number;
  readonly clicks: number;
  /** clicks / seen, 0 to 1; null when nobody saw it. */
  readonly clickRate: number | null;
  /** One figure per day, oldest first. */
  readonly seenByDay: readonly number[];
  readonly clicksByDay: readonly number[];
}

export interface BookingResults extends Tally {
  /** `placement:weekStart`, unique per booking. */
  readonly id: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  /** The booking's seven days, Monday first. */
  readonly days: readonly string[];
}

export interface AdResults {
  /** Every ad over the recent days, whichever placement. */
  readonly total: Tally & { readonly days: readonly string[] };
  /** One entry per booking, newest week first. */
  readonly bookings: readonly BookingResults[];
}

function rate(clicks: number, seen: number): number | null {
  return seen === 0 ? null : clicks / seen;
}

/** The seven `YYYY-MM-DD` days from a Monday. */
export function weekDays(weekStart: string): string[] {
  const start = Date.parse(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start)) throw new RangeError(`"${weekStart}" is not a date`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

/** The counts of `placement` (or of every placement, when null) over `days`, day by day. */
function tally(counts: readonly AdDayCount[], days: readonly string[], placement: DirectoryAdPlacement | null): Tally {
  const index = new Map(days.map((day, position) => [day, position]));
  const seenByDay = days.map(() => 0);
  const clicksByDay = days.map(() => 0);
  for (const row of counts) {
    const position = index.get(row.day);
    if (position === undefined || (placement !== null && row.placement !== placement)) continue;
    (row.kind === "impression" ? seenByDay : clicksByDay)[position] += row.count;
  }
  const seen = seenByDay.reduce((sum, value) => sum + value, 0);
  const clicks = clicksByDay.reduce((sum, value) => sum + value, 0);
  return { seen, clicks, clickRate: rate(clicks, seen), seenByDay, clicksByDay };
}

/** The results over `days` (oldest first) for all ads, and for each booking over its own week. */
export function buildAdResults(counts: readonly AdDayCount[], days: readonly string[], bookings: readonly AdBooking[]): AdResults {
  const newestFirst = [...bookings].sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.placement.localeCompare(b.placement));
  return {
    total: { ...tally(counts, days, null), days },
    bookings: newestFirst.map((booking) => {
      const bookingDays = weekDays(booking.weekStart);
      return {
        id: `${booking.placement}:${booking.weekStart}`,
        placement: booking.placement,
        weekStart: booking.weekStart,
        days: bookingDays,
        ...tally(counts, bookingDays, booking.placement),
      };
    }),
  };
}

/** "2.4%", one decimal under 10% and whole above; "–" when nobody saw the ad. */
export function formatClickRate(value: number | null): string {
  if (value === null) return "–";
  const percent = value * 100;
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}
