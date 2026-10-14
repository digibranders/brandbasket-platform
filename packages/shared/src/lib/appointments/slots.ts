/**
 * The Calendly-style week grid: turns a business's hours, closures and existing bookings into a week of bookable
 * slots. Pure and I/O-free — the platform site API calls buildWeekAvailability with data it has already loaded,
 * and the OTP flow calls findSlot to re-validate a requested slot server-side.
 *
 * This produces a plain object matching apps/platform/lib/site-bookings.ts's `SiteAvailability` contract exactly
 * (field-for-field), but that file lives in an app this package cannot import, so the shapes below are defined
 * locally and must be kept in sync with it by hand.
 */
import { addDays, formatMinutes, minutesOfDay, mondayOf, weekdayIndex, zonedTimeToUtc } from "../calendar/local-date";
import type { Closure } from "../business-facts/closures";
import { closureOn } from "../business-facts/closures";
import { toTimeOfDay, type StoredHoursRow } from "../onboarding/hours";

export const SLOT_MINUTE_OPTIONS = [15, 20, 30, 45, 60] as const;
export type SlotMinutes = (typeof SLOT_MINUTE_OPTIONS)[number];

export function isSlotMinutes(value: number): value is SlotMinutes {
  return (SLOT_MINUTE_OPTIONS as readonly number[]).includes(value);
}

const MINUTES_PER_DAY = 1440;
const DAYS_PER_WEEK = 7;

export type SiteSlotState = "free" | "taken" | "past";

export interface SiteSlot {
  readonly start: string; // "HH:MM", business local time
  readonly end: string; // "HH:MM"
  readonly state: SiteSlotState;
}

export interface SiteAvailabilityDay {
  readonly date: string; // YYYY-MM-DD
  /**
   * True on a closure, a weekday with no open hours that produce any slots, or a day outside the booking window.
   * **Not** true just because the day is before `today`: a past day still reports its normal open/closed status,
   * and if open, still lists its slots -- each one marked `past` (see buildWeekAvailability's doc comment) rather
   * than the day being hidden behind `closed`. This keeps the grid's shape (a day is either closed, or has a list
   * of slots with a state each) the same for every day in the window, so a caller never has to special-case "a
   * past day that would otherwise have been open".
   */
  readonly closed: boolean;
  /** The closure's note when a closure caused it, else null. */
  readonly closedNote: string | null;
  readonly slots: readonly SiteSlot[]; // empty when closed
}

export interface SiteAvailability {
  readonly weekStart: string; // the Monday, YYYY-MM-DD
  readonly today: string;
  readonly slotMinutes: number;
  /** Monday of the previous week, or null when that week is entirely in the past. */
  readonly previousWeek: string | null;
  /** Monday of the next week, or null when it starts after the booking window. */
  readonly nextWeek: string | null;
  readonly days: readonly SiteAvailabilityDay[]; // always 7, Monday first
}

/** One business_hours row, as read for a week's worth of slot generation. Times are "HH:MM" or "HH:MM:SS". */
export type WeekAvailabilityHoursRow = Pick<StoredHoursRow, "dayOfWeek" | "opensAt" | "closesAt" | "closed" | "openAllDay">;

/** One business_closures row, as read for slot generation — just enough to place it on the calendar and label it. */
export type WeekAvailabilityClosure = Pick<Closure, "startsOn" | "endsOn" | "note">;

/** One appointment already on the calendar, in the business's local time, for the date it falls on. */
export interface WeekAvailabilityBusy {
  readonly date: string; // YYYY-MM-DD
  readonly start: string; // "HH:MM" or "HH:MM:SS"
  readonly end: string;
}

export interface BuildWeekAvailabilityInput {
  /** Any date in the target week; normalised to its Monday. */
  readonly weekStart: string;
  /** Today's date in the business's time zone. */
  readonly today: string;
  /** Minutes since local midnight, right now, in the business's time zone. */
  readonly nowMinutes: number;
  /** The business's IANA time zone, e.g. "Asia/Kolkata" -- needed only to drop a slot whose local start time is
   * skipped entirely on a spring-forward day (see buildWeekAvailability's doc comment). */
  readonly timeZone: string;
  readonly hours: readonly WeekAvailabilityHoursRow[];
  readonly closures: readonly WeekAvailabilityClosure[];
  readonly slotMinutes: number;
  readonly minNoticeMinutes: number;
  readonly horizonDays: number;
  readonly busy: readonly WeekAvailabilityBusy[];
}

interface OpenRange {
  readonly startMinutes: number;
  readonly endMinutes: number; // exclusive; clipped to MINUTES_PER_DAY for an overnight range
}

/** The open ranges (in minutes since midnight) for one weekday, from every non-closed row that covers it, merged
 * where two rows overlap or touch. Split shifts normally produce more than one range; an "open all day" row
 * produces exactly one, 00:00-24:00. An overnight range (closesAt earlier than opensAt) is clipped at 24:00 rather
 * than wrapping into the next day -- which is also why merging runs after clipping, not before: a clipped
 * overnight row ending at 24:00 needs to merge with a same-day row that starts right at 24:00 (an "open all day"
 * duplicate, say), the same as any other pair of touching ranges. */
function openRangesFor(hours: readonly WeekAvailabilityHoursRow[], weekday: number): OpenRange[] {
  const ranges: OpenRange[] = [];
  for (const row of hours) {
    if (row.dayOfWeek !== weekday || row.closed) continue;
    if (row.openAllDay) {
      ranges.push({ startMinutes: 0, endMinutes: MINUTES_PER_DAY });
      continue;
    }
    if (row.opensAt === null || row.closesAt === null) continue;
    const startMinutes = minutesOfDay(toTimeOfDay(row.opensAt));
    const rawEndMinutes = minutesOfDay(toTimeOfDay(row.closesAt));
    const endMinutes = rawEndMinutes <= startMinutes ? MINUTES_PER_DAY : rawEndMinutes;
    if (endMinutes > startMinutes) ranges.push({ startMinutes, endMinutes });
  }
  return mergeRanges(ranges);
}

/**
 * Merges every pair of ranges that overlap or touch (one's end equals another's start), so overlapping hours rows
 * -- entered by mistake, or covering the same window from two split-shift rows -- never produce a slot aligned to
 * the wrong start, a slot repeated at two offsets, or a slot generated twice.
 */
function mergeRanges(ranges: readonly OpenRange[]): OpenRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: OpenRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && range.startMinutes <= last.endMinutes) {
      merged[merged.length - 1] = { startMinutes: last.startMinutes, endMinutes: Math.max(last.endMinutes, range.endMinutes) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/** True when a weekday has at least one open (non-closed) hours row. A weekday with no rows at all, or with only
 * closed rows, has none — both are treated as closed. */
function weekdayIsOpen(hours: readonly WeekAvailabilityHoursRow[], weekday: number): boolean {
  return hours.some((row) => row.dayOfWeek === weekday && !row.closed);
}

/**
 * Slots on the day's fixed grid -- whole multiples of `slotMinutes` from local midnight -- that fit inside `range`,
 * starting at the first grid point at or after the range's start. A final slot that would run past the range's end
 * is dropped rather than shortened.
 *
 * Why the grid and not the range's own start: a clinic with several doctors merges each doctor's slots into one
 * week (see clinic-availability.ts). If slots were aligned to each shift's opening time, a doctor starting at 09:15
 * and another at 09:00 would produce 09:15-09:45 and 09:00-09:30 -- overlapping slots a patient can't choose
 * between. Anchoring every calendar to midnight means two slots either coincide exactly or don't overlap at all.
 * The cost is that an off-grid opening (09:15 with 30-minute slots) loses the minutes before the first grid point.
 */
function slotsInRange(range: OpenRange, slotMinutes: number): Array<{ startMinutes: number; endMinutes: number }> {
  const slots: Array<{ startMinutes: number; endMinutes: number }> = [];
  const firstStart = Math.ceil(range.startMinutes / slotMinutes) * slotMinutes;
  for (let start = firstStart; start + slotMinutes <= range.endMinutes; start += slotMinutes) {
    slots.push({ startMinutes: start, endMinutes: start + slotMinutes });
  }
  return slots;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** One formatter per time zone, reused across calls: constructing an Intl.DateTimeFormat is far costlier than using
 * one, and localTimeExists runs once per candidate slot -- per practitioner, in a clinic week. */
const localPartsFormatters = new Map<string, Intl.DateTimeFormat>();

function localPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = localPartsFormatters.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  localPartsFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * True when `date`+`start` (business-local) survives a round trip through `timeZone`: converting it to UTC with
 * zonedTimeToUtc and reading that instant back gives the same local date and time. False only on a spring-forward
 * day, for a start time that falls inside the skipped hour (e.g. 02:00-02:59 in America/New_York on a spring
 * transition) -- zonedTimeToUtc's documented policy resolves that nonexistent request to a *later*, valid instant
 * (see its doc comment), so reading it back never reproduces the original `start`.
 */
function localTimeExists(date: string, start: string, timeZone: string): boolean {
  const utc = zonedTimeToUtc(date, start, timeZone);
  const parts = localPartsFormatter(timeZone).formatToParts(utc);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}` === date && `${hour}:${get("minute")}` === start;
}

/**
 * Builds a Monday-first week of availability. `input.weekStart` may be any date in the target week and is
 * normalised to its Monday first. Throws if `input.slotMinutes` isn't one of SLOT_MINUTE_OPTIONS: that value comes
 * from the clinic's own settings (parseSlotSettings, in settings-form.ts, is what should have validated it before
 * it ever reaches here), so an invalid one signals a bug upstream rather than bad user input to report kindly.
 *
 * Rules (see docs/superpowers/plans/2026-09-25-slot-booking.md, "Shared (pure)" and "Decisions"):
 * - A day is closed when a closure covers it, when its weekday has no open hours rows, when its open hours don't
 *   produce a single slot (e.g. every range is shorter than `slotMinutes`, or -- see below -- every slot in it
 *   falls in a spring-forward gap), or when it falls after `today + horizonDays - 1`.
 * - A day beyond the horizon is closed with a null note, even if a closure or open hours would otherwise apply.
 * - **Decision:** a day before `today` is *not* marked `closed` on that account alone -- its slots are generated
 *   normally and then marked `past` (see below), so the grid's shape (closed vs. a list of slots) stays stable
 *   across the whole window and a caller never has to special-case "a past day that would otherwise have been
 *   open". A closure, a genuinely closed weekday, or a weekday whose hours produce no slots is still `closed` in
 *   the past, same as any other day.
 * - Slots start on a fixed grid: whole multiples of `slotMinutes` from local midnight, beginning at the first grid
 *   point at or after each open range's start (09:15 opening with 30-minute slots -> first slot 09:30). This keeps
 *   several practitioners' calendars mergeable without overlapping slots -- see slotsInRange.
 * - A slot whose local start time doesn't exist (the business's clock skips it on a spring-forward day) is dropped
 *   entirely rather than shown as any state -- see localTimeExists.
 * - A slot is `past` when it starts before `today`'s midnight plus `nowMinutes` plus `minNoticeMinutes`, computed
 *   as an absolute minute offset from today's midnight (`(date - today in days) * 1440 + slotStartMinutes`) so
 *   notice correctly spills from a late slot today into tomorrow's early slots. This also means every slot on a
 *   day before `today` is past, and every slot far enough in the future is never past.
 * - A slot is `taken` when it overlaps any busy interval on its date, even partially.
 * - `taken` is only checked when the slot isn't already `past`; a past slot always reports `past`, whether or not
 *   it was also booked.
 */
export function buildWeekAvailability(input: BuildWeekAvailabilityInput): SiteAvailability {
  if (!isSlotMinutes(input.slotMinutes)) {
    throw new Error(`Not a published slot length: ${input.slotMinutes}. Expected one of ${SLOT_MINUTE_OPTIONS.join(", ")}.`);
  }

  const weekStart = mondayOf(input.weekStart);
  const lastBookableDate = addDays(input.today, input.horizonDays - 1);
  const noticeThresholdAbsoluteMinutes = input.nowMinutes + input.minNoticeMinutes;

  const days: SiteAvailabilityDay[] = [];
  for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
    const date = addDays(weekStart, offset);
    const closure = closureOn(input.closures, date);
    const beyondHorizon = date > lastBookableDate;
    const weekday = weekdayIndex(date);
    const eligible = !beyondHorizon && closure === null && weekdayIsOpen(input.hours, weekday);

    if (!eligible) {
      days.push({
        date,
        closed: true,
        closedNote: beyondHorizon ? null : (closure?.note ?? null),
        slots: [],
      });
      continue;
    }

    const dayOffsetMinutes = dayOffsetInMinutes(date, input.today);
    const busyOnDate = input.busy.filter((interval) => interval.date === date);
    const ranges = openRangesFor(input.hours, weekday);

    const slots: SiteSlot[] = ranges
      .flatMap((range) => slotsInRange(range, input.slotMinutes))
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .filter(({ startMinutes }) => localTimeExists(date, formatMinutes(startMinutes), input.timeZone))
      .map(({ startMinutes, endMinutes }) => {
        const isPast = dayOffsetMinutes + startMinutes < noticeThresholdAbsoluteMinutes;
        const isTaken =
          !isPast &&
          busyOnDate.some((interval) =>
            overlaps(
              startMinutes,
              endMinutes,
              minutesOfDay(toTimeOfDay(interval.start)),
              minutesOfDay(toTimeOfDay(interval.end)),
            ),
          );
        const state: SiteSlotState = isPast ? "past" : isTaken ? "taken" : "free";
        return { start: formatMinutes(startMinutes), end: formatMinutes(endMinutes), state };
      });

    // Open hours that don't actually produce a slot (every range shorter than slotMinutes, or every slot skipped
    // by a spring-forward gap) leave a day with nothing bookable; report it the same way as any other closed day
    // rather than an "open" day with an empty slot list, so callers only ever need to branch on `closed`.
    days.push(slots.length === 0 ? { date, closed: true, closedNote: null, slots: [] } : { date, closed: false, closedNote: null, slots });
  }

  const previousWeekMonday = addDays(weekStart, -DAYS_PER_WEEK);
  const previousWeekLastDay = addDays(previousWeekMonday, DAYS_PER_WEEK - 1);
  const previousWeek = previousWeekLastDay < input.today ? null : previousWeekMonday;

  const nextWeekMonday = addDays(weekStart, DAYS_PER_WEEK);
  const nextWeek = nextWeekMonday > lastBookableDate ? null : nextWeekMonday;

  return {
    weekStart,
    today: input.today,
    slotMinutes: input.slotMinutes,
    previousWeek,
    nextWeek,
    days,
  };
}

/** Whole days between `today` and `date` (negative when `date` is before `today`), converted to minutes, for the
 * "absolute minute offset from today's midnight" the notice check uses. */
function dayOffsetInMinutes(date: string, today: string): number {
  const dayCount = Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / (MINUTES_PER_DAY * 60_000));
  return dayCount * MINUTES_PER_DAY;
}

/** "09:00" and "09:30" become "09:00 – 09:30" (an en dash with a space on each side). */
export function slotLabel(start: string, end: string): string {
  return `${start} – ${end}`;
}

/** The slot at `date`/`start` in `availability`, or null when that day is closed or has no such slot. */
export function findSlot(availability: SiteAvailability, date: string, start: string): SiteSlot | null {
  const day = availability.days.find((candidate) => candidate.date === date);
  if (day === undefined || day.closed) return null;
  return day.slots.find((slot) => slot.start === start) ?? null;
}
