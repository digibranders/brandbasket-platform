/**
 * Calendar dates as `YYYY-MM-DD` strings, never `Date`s: opening hours, closures and appointment requests are all
 * about a day in the business's own time zone, and a `Date` carries a moment plus an implicit zone that would
 * silently shift the day at midnight.
 */
const ISO_DATE = /^(\d{4})-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * True for a real calendar date such as 2026-02-28 (and false for 2026-02-30), with the year limited to
 * 2000–2100: Postgres's `date` columns and every form in this app only ever deal in that range, so a year outside
 * it is treated as a typo rather than a valid (if unlikely) date.
 */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const SUPPORTED_TIME_ZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("timeZone"));

/**
 * The zone names this runtime recognizes, for a picker to offer: `Intl.supportedValuesOf("timeZone")` plus "UTC",
 * which some ICU builds resolve fine but don't actually list as a supported value.
 */
export const TIME_ZONE_OPTIONS: readonly string[] = SUPPORTED_TIME_ZONES.has("UTC")
  ? Intl.supportedValuesOf("timeZone")
  : ["UTC", ...Intl.supportedValuesOf("timeZone")];

/**
 * Resolves any spelling of a time zone to the exact name this runtime knows it by, or null when `value` isn't a
 * time zone at all (a bogus name, a bare UTC offset such as "+05:30", ...). `Intl.DateTimeFormat` matches IANA
 * names case-insensitively and already follows renames on its own — "asia/kolkata" and "Asia/Kolkata" both resolve
 * to whatever this ICU build canonically calls that zone, and "Etc/UTC" resolves to "UTC" — so this normalises
 * case and legacy aliases for free instead of needing a table of them. Store the resolved value, not `value`
 * itself, so a picker built from `TIME_ZONE_OPTIONS` can select it back with `canonicalTimeZone(stored)`.
 */
export function canonicalTimeZone(value: string): string | null {
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  return resolved === "UTC" || SUPPORTED_TIME_ZONES.has(resolved) ? resolved : null;
}

export function isValidTimeZone(value: string): boolean {
  return canonicalTimeZone(value) !== null;
}

/**
 * The zone a business's "today" is read in when it has no time zone stored. The Listing tab and the directory feed
 * use this; it matches the "UTC" that Your details and site-info already fall back to.
 */
export const DEFAULT_BUSINESS_TIME_ZONE = "UTC";

/** Today's date where the business is, e.g. localDateIn("Asia/Kolkata", now). */
export function localDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error(`Intl.DateTimeFormat did not return a "${type}" part for time zone "${timeZone}".`);
    }
    return part.value;
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `date` must already be a valid ISO date (see isIsoDate); this does not validate it. */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Monday = 0, matching business_hours.day_of_week. `date` must already be a valid ISO date (see isIsoDate). */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday of `date`'s week, e.g. mondayOf("2026-09-30") === "2026-09-28". `date` must already be a valid ISO date. */
export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** `time` must already be "HH:MM" (see minutesOfDay for the exact grammar accepted). */
const TIME_OF_DAY = /^(\d{2}):(\d{2})$/;

/**
 * Minutes since local midnight for an "HH:MM" string, e.g. minutesOfDay("09:30") === 570. Accepts "24:00" as 1440
 * (end-of-day: the close of a day that runs to midnight, or the clipped end of an overnight range) — every other
 * hour must be 00-23 and every minute 00-59, so "24:30" and "25:00" are both rejected.
 */
export function minutesOfDay(time: string): number {
  const match = TIME_OF_DAY.exec(time);
  if (match === null) throw new Error(`Not a time in "HH:MM" form: "${time}".`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) {
    throw new Error(`Not a valid time of day: "${time}".`);
  }
  return hour * 60 + minute;
}

/** The inverse of minutesOfDay: formatMinutes(570) === "09:30". Accepts 1440 (see minutesOfDay) and formats it "24:00". */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes > 1440) {
    throw new Error(`Not a valid minute-of-day offset: ${totalMinutes}.`);
  }
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * One Intl.DateTimeFormat per time zone, reused across every offsetMinutesAt call: constructing a formatter does a
 * real IANA lookup, and zonedTimeToUtc's binary search can call this dozens of times for a single conversion.
 */
const zoneOffsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneOffsetFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneOffsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The offset of `timeZone` from UTC at `instant`, in minutes, positive east of UTC (e.g. +330 for Asia/Kolkata).
 * Reads the zone's wall-clock reading of `instant` and compares it against `instant` itself, treating the reading
 * as if it were UTC — the same trick `localDateIn` uses one field at a time.
 *
 * `instant` must fall on a whole second (no milliseconds remainder). Intl.DateTimeFormat only ever reports whole
 * seconds, so probing an instant that isn't already second-aligned silently drops its sub-second remainder before
 * computing the offset, which then comes back off by a fraction of a minute — exactly the kind of error that can
 * shift a binary search's decision near a transition. zonedTimeToUtc only ever calls this with millisecond values
 * that are multiples of 1000, so this is enforced there rather than re-checked on every call here.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = offsetFormatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error(`Intl.DateTimeFormat did not return a "${type}" part for time zone "${timeZone}".`);
    }
    return Number(part.value);
  };
  // Intl's h23 cycle can still print "24" for exact midnight on some ICU builds; treat it as 00.
  const hour = get("hour") % 24;
  const readingAsUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return (readingAsUtcMs - instant.getTime()) / 60_000;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Converts a wall-clock time in `timeZone` to the UTC instant it names, correct across DST. `date` must already be
 * a valid ISO date and `time` an "HH:MM" accepted by minutesOfDay.
 *
 * Brackets `date`+`time` with the zone's UTC offset a day earlier and a day later (wider than any real-world DST
 * shift, which never exceeds a couple of hours) and, when those two offsets differ, binary-searches for the exact
 * UTC instant the offset changes at. That pins down the two cases a plain offset lookup gets wrong:
 *
 * - **A local time that doesn't exist** (the clocks spring forward, e.g. 2026-03-08 02:30 in America/New_York,
 *   skipped when 01:59:59 EST becomes 03:00:00 EDT): resolved using the offset from *before* the jump, which is
 *   equivalent to sliding the requested time forward by exactly the length of the gap — 02:30 lands on the same
 *   instant as 03:30 EDT (07:30Z). This is documented behaviour, not a guess: any other resolution would need to
 *   invent a UTC instant that doesn't correspond to the literal digits typed.
 * - **A local time named twice** (the clocks fall back, e.g. 2026-10-25 01:30 in Europe/London, reached once as
 *   01:30 BST and again an hour later as 01:30 GMT): resolved to the *earlier* of the two instants (the BST one),
 *   per the doc's decision to always prefer the first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const naiveMinutes = minutesOfDay(time);
  const naiveMs = Date.UTC(year, month - 1, day, 0, 0, 0) + naiveMinutes * 60_000;

  const earlyOffset = offsetMinutesAt(new Date(naiveMs - DAY_MS), timeZone);
  const lateOffset = offsetMinutesAt(new Date(naiveMs + DAY_MS), timeZone);

  if (earlyOffset === lateOffset) {
    return new Date(naiveMs - earlyOffset * 60_000);
  }

  // A transition sits somewhere between naiveMs - DAY_MS and naiveMs + DAY_MS (both whole-second instants, since
  // naiveMs is built from whole minutes and DAY_MS is a whole number of seconds). Find the UTC instant where the
  // offset flips from earlyOffset to lateOffset, to the nearest second.
  //
  // The midpoint is rounded down to a whole second (not just a whole millisecond): offsetMinutesAt requires a
  // second-aligned probe (see its doc comment) to avoid returning a fractional offset, and every probe this loop
  // makes must stay second-aligned too, or the search can converge a few minutes off from the real transition.
  // Because lowUtc and highUtc start whole-second-aligned and every update below keeps them that way, the gap
  // between them is always a whole number of seconds, so rounding the midpoint down can never collapse it onto
  // lowUtc: the smallest gap this loop's body ever runs on is 2 seconds (the loop exits once the gap is <= 1
  // second), and rounding a 2-second gap's midpoint down always lands 1 second above lowUtc.
  let lowUtc = naiveMs - DAY_MS;
  let highUtc = naiveMs + DAY_MS;
  while (highUtc - lowUtc > 1000) {
    const midUtc = Math.floor((lowUtc + highUtc) / 2000) * 1000;
    if (offsetMinutesAt(new Date(midUtc), timeZone) === earlyOffset) lowUtc = midUtc;
    else highUtc = midUtc;
  }
  const transitionUtc = highUtc; // first instant reading with lateOffset

  const offset = resolveOffsetAcrossTransition(naiveMs, transitionUtc, earlyOffset, lateOffset);
  return new Date(naiveMs - offset * 60_000);
}

/**
 * Picks which of the two offsets straddling a DST transition applies to a requested wall-clock instant
 * (`naiveMs`, the requested date+time read as if it were UTC millis). See zonedTimeToUtc's doc comment for the
 * gap/overlap policy this implements.
 */
function resolveOffsetAcrossTransition(naiveMs: number, transitionUtc: number, earlyOffset: number, lateOffset: number): number {
  if (lateOffset > earlyOffset) {
    // Spring forward: the wall clock jumps forward, skipping everything from the reading just before the jump up
    // to `afterJump` (the reading right after it, exclusive). Anything in that gap doesn't exist and resolves to
    // earlyOffset (see the doc comment above).
    const afterJump = transitionUtc + lateOffset * 60_000;
    return naiveMs >= afterJump ? lateOffset : earlyOffset;
  }
  // Fall back: the wall clock jumps backward at `beforeFallback` (the reading right before the jump). Everything
  // from there back down to the reading right after it is named twice and resolves to earlyOffset, the earlier
  // (pre-fallback) occurrence.
  const beforeFallback = transitionUtc + earlyOffset * 60_000;
  return naiveMs >= beforeFallback ? lateOffset : earlyOffset;
}
