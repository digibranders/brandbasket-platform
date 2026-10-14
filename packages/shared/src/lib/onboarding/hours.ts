/**
 * Opening hours as the customer sees them: each day is closed, open all day, or open between two times. A day
 * with no entry has no hours given. A closing time earlier than the opening time closes after midnight
 * (18:00 to 02:00); equal times are never stored.
 */
export type OpeningHours =
  | { readonly dayOfWeek: number; readonly mode: "closed" }
  | { readonly dayOfWeek: number; readonly mode: "all-day" }
  | { readonly dayOfWeek: number; readonly mode: "open"; readonly opensAt: string; readonly closesAt: string };

export type OpeningMode = OpeningHours["mode"];

/** What the editor offers for each day. "unset" saves nothing for that day. */
export const DAY_MODES = ["unset", "open", "closed", "all-day"] as const;
export type DayMode = (typeof DAY_MODES)[number];

export const DAY_MODE_LABELS: Readonly<Record<DayMode, string>> = {
  unset: "Not set",
  open: "Open",
  closed: "Closed",
  "all-day": "Open 24 hours",
};

export const NEXT_DAY_NOTE = "(next day)";

export function isDayMode(value: string): value is DayMode {
  return (DAY_MODES as readonly string[]).includes(value);
}

/** One row as the business_hours table holds it, whichever query read it. */
export interface StoredHoursRow {
  readonly dayOfWeek: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly openAllDay: boolean;
}

/** Both `HH:MM`. True when the day closes after midnight. */
export function closesNextDay(opensAt: string, closesAt: string): boolean {
  return closesAt < opensAt;
}

export function toStoredHours(day: OpeningHours): StoredHoursRow {
  switch (day.mode) {
    case "closed":
      return { dayOfWeek: day.dayOfWeek, opensAt: null, closesAt: null, closed: true, openAllDay: false };
    case "all-day":
      return { dayOfWeek: day.dayOfWeek, opensAt: null, closesAt: null, closed: false, openAllDay: true };
    case "open":
      return { dayOfWeek: day.dayOfWeek, opensAt: day.opensAt, closesAt: day.closesAt, closed: false, openAllDay: false };
  }
}

/** `HH:MM:SS` from Postgres to the `HH:MM` a time input, the form parser, and appointments/slots.ts's slot
 * generation all use. A value that's already `HH:MM` passes through unchanged. */
export function toTimeOfDay(value: string): string {
  return value.slice(0, 5);
}

/** A stored row as the customer sees it, or null for a row that cannot be shown (the database refuses those). */
export function fromStoredHours(row: StoredHoursRow): OpeningHours | null {
  if (row.closed) return { dayOfWeek: row.dayOfWeek, mode: "closed" };
  if (row.openAllDay) return { dayOfWeek: row.dayOfWeek, mode: "all-day" };
  if (row.opensAt === null || row.closesAt === null) return null;
  return {
    dayOfWeek: row.dayOfWeek,
    mode: "open",
    opensAt: toTimeOfDay(row.opensAt),
    closesAt: toTimeOfDay(row.closesAt),
  };
}

/** "Closed", "Open 24 hours", "09:00 – 18:00" or "18:00 – 02:00 (next day)". */
export function describeHours(day: OpeningHours): string {
  switch (day.mode) {
    case "closed":
      return "Closed";
    case "all-day":
      return DAY_MODE_LABELS["all-day"];
    case "open": {
      const range = `${day.opensAt} – ${day.closesAt}`;
      return closesNextDay(day.opensAt, day.closesAt) ? `${range} ${NEXT_DAY_NOTE}` : range;
    }
  }
}

/**
 * One line for a day that may hold several stored rows (split shifts, which staff may enter): every open period in
 * order, or "Closed" when nothing is open, or null when the day has no hours given.
 */
export function describeStoredDay(rows: readonly StoredHoursRow[]): string | null {
  const days = rows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null);
  if (days.length === 0) return null;
  const open = days.filter((day) => day.mode !== "closed");
  if (open.length === 0) return describeHours({ dayOfWeek: days[0]?.dayOfWeek ?? 0, mode: "closed" });
  return open.map(describeHours).join(", ");
}

const MINUTES_PER_DAY = 24 * 60;
const DAY_ABBREVIATIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "09:30" -> "9:30 am", "19:00" -> "7 pm", "24:00" or "00:00" -> "12 am". */
export function clockLabel(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 24;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minutes === 0 ? `${twelve} ${suffix}` : `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** The business's calendar date (`YYYY-MM-DD`) and minutes since Monday 00:00, on the clock of `timeZone`. */
function clockIn(timeZone: string, moment: Date): { readonly date: string; readonly weekMinute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(moment);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const day = DAY_ABBREVIATIONS.indexOf(read("weekday") as (typeof DAY_ABBREVIATIONS)[number]);
  if (day < 0) throw new Error(`Cannot read the weekday of ${moment.toISOString()} in ${timeZone}`);
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    weekMinute: day * MINUTES_PER_DAY + Number(read("hour")) * 60 + Number(read("minute")),
  };
}

/** `date` (`YYYY-MM-DD`) moved by `days`, whole calendar days. */
function addDaysTo(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** A stretch of days with different hours than the usual week: a holiday. See Closure in business-facts/closures. */
export interface HolidayInput {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  readonly opensAt?: string | null;
  readonly closesAt?: string | null;
}

interface OpenSpan {
  readonly start: number;
  readonly end: number;
  readonly opens: string;
  readonly allDay: boolean;
  /** The holiday this span belongs to, when it does. */
  readonly holiday: HolidayInput | null;
}

/**
 * The state of the business right now and when it next changes, from its stored week and its holidays: "Open · Closes
 * 7 pm", "Closed · Opens 11 am", "Closed · Opens Tue 9:30 am", "Open 24 hours", or on a holiday "Closed today · Diwali"
 * and "Open · Closes 2 pm · Diwali". A holiday replaces the usual hours on its own dates only. Null when no day has
 * hours given and no holiday is near.
 */
export function describeOpenStatus(
  rows: readonly StoredHoursRow[],
  timeZone: string,
  moment: Date,
  holidays: readonly HolidayInput[] = [],
): string | null {
  const days = rows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null);
  if (days.length === 0) return null;
  const { date: today, weekMinute: now } = clockIn(timeZone, moment);
  const todayIndex = Math.floor(now / MINUTES_PER_DAY);

  // Yesterday (it may run past midnight) through the next week, day by day, so a holiday and the weekly hours meet
  // on the right dates.
  const spans: OpenSpan[] = [];
  for (let offset = -1; offset <= 7; offset += 1) {
    const date = addDaysTo(today, offset);
    const dayStart = (todayIndex + offset) * MINUTES_PER_DAY;
    const weekday = (((todayIndex + offset) % 7) + 7) % 7;
    const holiday = holidays.find((entry) => entry.startsOn <= date && date <= entry.endsOn) ?? null;
    const add = (opens: string, closes: string, allDay: boolean): void => {
      const start = dayStart + (allDay ? 0 : timeToMinutes(opens));
      const end = allDay ? start + MINUTES_PER_DAY : dayStart + timeToMinutes(closes);
      spans.push({ start, end: end <= start ? end + MINUTES_PER_DAY : end, opens: allDay ? "00:00" : opens, allDay, holiday });
    };
    if (holiday !== null) {
      if (typeof holiday.opensAt === "string" && typeof holiday.closesAt === "string") add(holiday.opensAt, holiday.closesAt, false);
      continue;
    }
    for (const day of days) {
      if (day.dayOfWeek !== weekday || day.mode === "closed") continue;
      if (day.mode === "all-day") add("00:00", "24:00", true);
      else add(day.opensAt, day.closesAt, false);
    }
  }

  const reasonOf = (holiday: HolidayInput | null): string => (holiday?.note ? ` · ${holiday.note}` : "");
  const current = spans.find((span) => now >= span.start && now < span.end);
  if (current !== undefined) {
    if (current.allDay) return `${DAY_MODE_LABELS["all-day"]}${reasonOf(current.holiday)}`;
    const inDay = ((current.end % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const closes = `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
    return `Open · Closes ${clockLabel(closes)}${reasonOf(current.holiday)}`;
  }
  const todaysHoliday = holidays.find((entry) => entry.startsOn <= today && today <= entry.endsOn) ?? null;
  const next = spans.filter((span) => span.start > now).sort((a, b) => a.start - b.start)[0];
  const opensLaterToday = next !== undefined && next.start < (todayIndex + 1) * MINUTES_PER_DAY;
  if (todaysHoliday !== null && !opensLaterToday) return `Closed today${reasonOf(todaysHoliday)}`;
  if (next === undefined) return "Closed";
  const nextDay = Math.floor(next.start / MINUTES_PER_DAY);
  const when = clockLabel(next.opens);
  if (nextDay === todayIndex) return `Closed · Opens ${when}${reasonOf(next.holiday)}`;
  return `Closed · Opens ${DAY_ABBREVIATIONS[((nextDay % 7) + 7) % 7]} ${when}${reasonOf(next.holiday)}`;
}
