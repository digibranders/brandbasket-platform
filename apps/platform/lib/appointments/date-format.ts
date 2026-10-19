/**
 * Pure date formatting for the clinic dashboard's week grid and booking details: "Mon 28" for a grid day header,
 * "28 Sep – 4 Oct 2026" for the week range, and "Monday 28 September" (the year appended only when it isn't
 * `currentYear`) for a booking's own slot date. Locale-fixed (en-US) so every clinic sees the same form regardless
 * of their own device locale.
 *
 * Every date string in and out is the business's own local calendar date (YYYY-MM-DD), never a zoned instant --
 * the caller reads "today" and "currentYear" from `localDateIn(timeZone, now)` (see the appointments page), so a
 * clinic in a zone where it's already tomorrow (or still yesterday) relative to the server doesn't get a year
 * suffix, or a "today" nav link, one day early or late. `formatRelativeTime` is the one exception: it takes two
 * instants directly (an appointment's `createdAt` and the current moment), since "2 hours ago" doesn't depend on
 * any particular calendar day.
 */
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const MONTH_LONG_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

interface DateParts {
  readonly year: number;
  readonly day: number;
  /** UTC midnight for `year`/`day` -- never shown itself, only fed to the UTC-anchored Intl formatters above,
   * which is how every formatter here reads a wall date without an implicit zone shift. */
  readonly date: Date;
}

/** `value` must already be a real calendar date (YYYY-MM-DD, see @brandbasket/shared's isIsoDate); this does not
 * validate it. */
function parts(value: string): DateParts {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Expected a YYYY-MM-DD date, received ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return { year, day, date: new Date(Date.UTC(year, month - 1, day)) };
}

/** "2026-09-28" -> "Mon 28", the week grid's day-column header. No year: the week range label beside it
 * (formatWeekRangeLabel) already carries one. */
export function formatGridDayLabel(value: string): string {
  const { date, day } = parts(value);
  return `${WEEKDAY_SHORT_FORMAT.format(date)} ${String(day)}`;
}

/**
 * `weekStart`'s Monday through the following Sunday, e.g. "28 Sep – 4 Oct 2026". Always carries a year -- unlike
 * formatLongDate below, this label has to read right on its own, with no "current year" for context, since it's
 * the one thing on the page that names the week being viewed. Both ends carry a year when the week crosses one,
 * e.g. "29 Dec 2026 – 4 Jan 2027". `weekStart` must already be a Monday (see @brandbasket/shared's mondayOf); this
 * does not re-normalise it.
 */
export function formatWeekRangeLabel(weekStart: string): string {
  const start = parts(weekStart);
  const end = parts(addDays(weekStart, 6));
  const startLabel =
    start.year === end.year
      ? `${String(start.day)} ${MONTH_SHORT_FORMAT.format(start.date)}`
      : `${String(start.day)} ${MONTH_SHORT_FORMAT.format(start.date)} ${String(start.year)}`;
  const endLabel = `${String(end.day)} ${MONTH_SHORT_FORMAT.format(end.date)} ${String(end.year)}`;
  return `${startLabel} – ${endLabel}`;
}

/** "2026-09-28" -> "Monday 28 September", with the year appended only when it isn't `currentYear`. Used for a
 * booking's own slot date in the details panel, and for the cancelled-this-week list. */
export function formatLongDate(value: string, currentYear: number): string {
  const { date, day, year } = parts(value);
  const base = `${WEEKDAY_LONG_FORMAT.format(date)} ${String(day)} ${MONTH_LONG_FORMAT.format(date)}`;
  return year === currentYear ? base : `${base} ${String(year)}`;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** "2026-09" -> "September 2026", the Month view's own title. Always carries the year, same reasoning as
 * formatWeekRangeLabel: it's the one thing on the page naming which month is being viewed, with no "current year"
 * to omit it against. */
export function formatMonthTitle(value: string): string {
  const match = MONTH_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Expected a YYYY-MM month, received ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${MONTH_LONG_FORMAT.format(date)} ${String(year)}`;
}

const TIME_OF_DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();

/** One Intl.DateTimeFormat per time zone, reused across calls rather than rebuilt on every booking row. */
function timeOfDayFormat(timeZone: string): Intl.DateTimeFormat {
  let format = TIME_OF_DAY_FORMATS.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
    TIME_OF_DAY_FORMATS.set(timeZone, format);
  }
  return format;
}

/**
 * "Booked <date time>": `instant` (an appointment's `createdAt`) read in the business's own time zone, as
 * "Monday 28 September, 14:03" -- 24-hour, matching the grid's own "times use 24-hour HH:MM" rule. `timeZone`
 * should be the business's own zone; falling back to "UTC" when it's unset is the caller's job, same as elsewhere
 * on this page (see findBusinessTimeZone's callers).
 */
export function formatBookedAt(instant: Date, timeZone: string, currentYear: number): string {
  const localDate = localDateIn(timeZone, instant);
  const time = timeOfDayFormat(timeZone).format(instant);
  return `${formatLongDate(localDate, currentYear)}, ${time}`;
}

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** Largest unit first, so `formatRelativeTime` picks the coarsest one `instant` is at least one whole unit away by
 * -- the same "biggest unit that still reads as at least 1" rule `Intl.RelativeTimeFormat` itself expects a caller
 * to apply; it doesn't pick a unit on its own. */
const RELATIVE_TIME_UNITS: ReadonlyArray<{ readonly unit: Intl.RelativeTimeFormatUnit; readonly seconds: number }> = [
  { unit: "year", seconds: 31_536_000 },
  { unit: "month", seconds: 2_592_000 },
  { unit: "week", seconds: 604_800 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/** "2 hours ago" for a booking's `createdAt` against the current moment -- what the details panel's "Booked …"
 * line leads with (see `formatBookedAt` above for the exact time it carries as a `<time>` element's `dateTime`/
 * `title`, for whoever wants it). Anything under 45 seconds reads as "just now" rather than "0 minutes ago"; past
 * that, `Intl.RelativeTimeFormat` supplies the words ("yesterday", "last week", ...) for whichever unit `instant`
 * is at least one whole one away from `now` by. Always past tense here -- a booking's `createdAt` is never in the
 * future relative to `now` -- but the underlying arithmetic is signed, so a future instant would read "in 2 hours"
 * just as correctly. */
export function formatRelativeTime(instant: Date, now: Date): string {
  const diffSeconds = (instant.getTime() - now.getTime()) / 1000;
  if (Math.abs(diffSeconds) < 45) return "just now";

  for (const { unit, seconds } of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) return RELATIVE_TIME_FORMAT.format(Math.round(diffSeconds / seconds), unit);
  }
  return RELATIVE_TIME_FORMAT.format(Math.round(diffSeconds / 60), "minute");
}
