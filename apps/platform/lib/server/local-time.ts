/**
 * Pure `Intl`-based conversions from a UTC instant to a business's local wall-clock reading. Used by
 * `lib/server/availability.ts` to turn `listBusyIntervals`'s UTC `{startsAt, endsAt}` rows, and "now", into the
 * local date/HH:MM shapes `buildWeekAvailability` (packages/shared) expects. No I/O — safe to unit test directly,
 * including across a DST transition.
 */

interface LocalReading {
  readonly date: string; // YYYY-MM-DD
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
}

/** The wall-clock date and time `timeZone` reads at `instant`. `hourCycle: "h23"` still prints "24" for exact
 * midnight on some ICU builds, so the hour is taken mod 24 (the same guard `zonedTimeToUtc`'s offset lookup uses in
 * packages/shared/src/lib/calendar/local-date.ts). */
function readLocal(instant: Date, timeZone: string): LocalReading {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error(`Intl.DateTimeFormat did not return a "${type}" part for time zone "${timeZone}".`);
    }
    return part.value;
  };
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function formatHhMm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface LocalInterval {
  readonly date: string; // YYYY-MM-DD, the local date the interval starts on
  readonly start: string; // HH:MM
  readonly end: string; // HH:MM, "24:00" when the interval's end reads on a later local date
}

/**
 * Converts a UTC `[startsAt, endsAt)` interval (as `listBusyIntervals` returns) to the local date/start/end
 * `buildWeekAvailability`'s `busy` input wants, in `timeZone`. The conversion is a direct forward read of each
 * instant (`readLocal`), so it needs no DST gap/overlap resolution — that ambiguity only exists for the reverse
 * direction (`zonedTimeToUtc`), which the OTP intake uses instead.
 *
 * An interval whose end reads on a later local date than its start (crossing local midnight — not expected for a
 * single appointment under normal opening hours, but not assumed impossible either) has its end clipped to
 * "24:00", the same convention `openRangesFor` (packages/shared/src/lib/appointments/slots.ts) uses for a range
 * that runs past midnight.
 */
export function utcIntervalToLocal(interval: { readonly startsAt: Date; readonly endsAt: Date }, timeZone: string): LocalInterval {
  const start = readLocal(interval.startsAt, timeZone);
  const end = readLocal(interval.endsAt, timeZone);
  return {
    date: start.date,
    start: formatHhMm(start.hour, start.minute),
    end: end.date === start.date ? formatHhMm(end.hour, end.minute) : "24:00",
  };
}

/** Minutes since local midnight, right now, in `timeZone` — `buildWeekAvailability`'s `nowMinutes` input. */
export function nowMinutesIn(timeZone: string, now: Date): number {
  const reading = readLocal(now, timeZone);
  return reading.hour * 60 + reading.minute;
}
