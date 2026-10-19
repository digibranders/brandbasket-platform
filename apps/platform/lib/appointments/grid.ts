/**
 * The clinic dashboard's week grid shape: one column per weekday (with whether it's closed), and one row per
 * distinct slot start time the week's open hours produce. Pure and I/O-free -- the page reads hours, closures and
 * this week's appointments, then hands them here.
 *
 * Reuses `buildWeekAvailability` (packages/shared/src/lib/appointments/slots.ts) for the actual slot generation --
 * called with `busy: []` and `minNoticeMinutes: 0` so every generated slot comes back "free", a state this module
 * ignores entirely: which appointment (if any) fills a cell is resolved separately, from the business's own
 * bookings, not from availability. `horizonDays` is passed as a very large number rather than the clinic's real
 * booking-window setting, because the dashboard shows the clinic's actual hours for whatever week it's asked to
 * show -- including weeks further out than patients are currently allowed to book -- rather than clamping to the
 * patient-facing window.
 *
 * `buildWeekAvailability` reports a day `closed` not only for a closure or a weekday with no hours rows, but also
 * when its open hours don't actually produce a single slot (every range shorter than `slotMinutes`, or every slot
 * on it skipped by a spring-forward gap). That's still just a header annotation here, same as any other closed
 * day: AppointmentsGrid (components/panel/appointments/appointments-grid.tsx) renders row cells on a closed day
 * regardless, so a stray booking made before the hours or slot length changed underneath it still shows.
 */
import { buildWeekAvailability, type WeekAvailabilityClosure, type WeekAvailabilityHoursRow } from "@brandbasket/shared/lib/appointments/slots";
import { minutesOfDay } from "@brandbasket/shared/lib/calendar/local-date";
import type { AppointmentRow } from "@brandbasket/db";

/** Effectively unlimited: see the module doc comment on why this isn't the clinic's real horizonDays setting. */
const GRID_HORIZON_DAYS = 36_500;

export interface GridRow {
  readonly start: string; // "HH:MM"
  readonly end: string; // "HH:MM"
}

export interface GridDay {
  readonly date: string; // YYYY-MM-DD
  readonly closed: boolean;
  readonly closedNote: string | null;
}

export interface WeekGrid {
  readonly days: readonly GridDay[]; // always 7, Monday first
  readonly rows: readonly GridRow[]; // sorted by start time
}

export interface WeekGridInput {
  /** Any date in the target week; normalised to its Monday by buildWeekAvailability. */
  readonly weekStart: string;
  /** Today's date in the business's time zone -- only used here to satisfy buildWeekAvailability's input shape;
   * with minNoticeMinutes 0 and a huge horizon, it has no effect on this function's own output. */
  readonly today: string;
  /** The business's IANA time zone -- always set while the Appointments module is on (switching it on requires a
   * zone; see ModuleNeedsTimeZoneError). Needed only to drop a slot whose local start time is skipped entirely on
   * a spring-forward day (see buildWeekAvailability's doc comment); it has no other effect on this grid. */
  readonly timeZone: string;
  readonly hours: readonly WeekAvailabilityHoursRow[];
  readonly closures: readonly WeekAvailabilityClosure[];
  readonly slotMinutes: number;
  /** This week's appointments (any status) -- used only to add a row for a booking whose start doesn't land on
   * one of the hours-derived slots (the clinic's slot length changed since it was made). Cancelled appointments
   * never add a row of their own: a cancelled booking made under an old slot length has no reason to widen the
   * grid, since nothing occupies that row any more. */
  readonly appointments: readonly Pick<AppointmentRow, "localStart" | "localEnd" | "status">[];
}

/** The `date|start` key `AppointmentsGrid` (components/panel/appointments/appointments-grid.tsx) looks appointments
 * up by, kept here so the page, the grid component and this module all build it the same way. */
export function cellKey(date: string, start: string): string {
  return `${date}|${start}`;
}

export function buildWeekGrid(input: WeekGridInput): WeekGrid {
  const availability = buildWeekAvailability({
    weekStart: input.weekStart,
    today: input.today,
    nowMinutes: 0,
    timeZone: input.timeZone,
    hours: input.hours,
    closures: input.closures,
    slotMinutes: input.slotMinutes,
    minNoticeMinutes: 0,
    horizonDays: GRID_HORIZON_DAYS,
    busy: [],
  });

  const days: GridDay[] = availability.days.map((day) => ({ date: day.date, closed: day.closed, closedNote: day.closedNote }));

  const rowsByStart = new Map<string, GridRow>();
  for (const day of availability.days) {
    for (const slot of day.slots) rowsByStart.set(slot.start, { start: slot.start, end: slot.end });
  }
  for (const appointment of input.appointments) {
    if (appointment.status === "cancelled" || rowsByStart.has(appointment.localStart)) continue;
    rowsByStart.set(appointment.localStart, { start: appointment.localStart, end: appointment.localEnd });
  }

  const rows = [...rowsByStart.values()].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start));
  return { days, rows };
}

/** The first word of a full name, for a booked or done cell's visible label -- "Arjun Menon" reads as "Arjun".
 * Falls back to the trimmed whole string when there's no space to split on (a one-word name). */
export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
}
