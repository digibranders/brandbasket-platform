/**
 * A clinic's week when it has more than one practitioner (doctor): each practitioner has their own hours, leave and
 * bookings, and the clinic shares one slot length, one booking window and one set of closures. Pure and I/O-free,
 * like slots.ts, which it builds on.
 *
 * The approach is to run the single-calendar engine (buildWeekAvailability) once per practitioner and merge the
 * results, rather than teach that engine about practitioners. That keeps every per-calendar rule (notice, horizon,
 * spring-forward gaps, past-beats-taken) in exactly one place, and guarantees a one-doctor clinic behaves exactly as
 * a clinic did before practitioners existed. Merging works because slots.ts aligns every slot to the same
 * midnight-anchored grid: two practitioners' slots at a given start are always the same slot, never offset.
 *
 * The merged `SiteAvailability` is what a patient choosing "any doctor" sees; `freeBySlot` answers "which doctors
 * could take this slot", for assigning a booking or for a patient who picked a specific doctor.
 */
import { addDays } from "../calendar/local-date";
import { closureOn } from "../business-facts/closures";
import {
  buildWeekAvailability,
  type BuildWeekAvailabilityInput,
  type SiteAvailability,
  type SiteAvailabilityDay,
  type SiteSlot,
  type SiteSlotState,
  type WeekAvailabilityBusy,
  type WeekAvailabilityClosure,
  type WeekAvailabilityHoursRow,
} from "./slots";

export interface PractitionerCalendar {
  readonly id: string;
  /** Already resolved: the clinic's hours when the doctor uses them, else the doctor's own. */
  readonly hours: readonly WeekAvailabilityHoursRow[];
  /** The practitioner's own days off. Their notes are private to the clinic and never reach the output. */
  readonly leave: readonly WeekAvailabilityClosure[];
  readonly busy: readonly WeekAvailabilityBusy[];
}

export interface BuildClinicWeekInput extends Omit<BuildWeekAvailabilityInput, "hours" | "busy"> {
  /** Clinic closures stay in `closures`: a clinic holiday closes every doctor. */
  readonly practitioners: readonly PractitionerCalendar[];
}

export interface ClinicWeek {
  readonly availability: SiteAvailability;
  /** Keyed by `${date}T${start}`: practitioner ids free for that slot, in `practitioners` order. */
  readonly freeBySlot: ReadonlyMap<string, readonly string[]>;
}

function slotKey(date: string, start: string): string {
  return `${date}T${start}`;
}

/** One practitioner's week, tagged with their id so the merge can attribute free slots. */
interface PractitionerWeek {
  readonly id: string;
  readonly availability: SiteAvailability;
}

/**
 * Builds the clinic's merged week. Rules, on top of buildWeekAvailability's own (see its doc comment):
 * - Each practitioner's calendar is their hours, their bookings, and the clinic's closures plus their own leave.
 *   Leave is passed with its note blanked, so a practitioner's private reason ("Conference", "Sick") can never
 *   surface as a day's `closedNote`.
 * - A day is closed only when every practitioner's day is closed. Its note is then the clinic closure covering that
 *   date (null when none, or when the day is beyond the booking horizon -- matching buildWeekAvailability).
 * - An open day lists the union of every practitioner's slot starts, sorted. A slot is `free` when any practitioner
 *   has it free, else `taken` when any has it taken, else `past`. Since `past` depends only on the clinic-wide
 *   clock and notice, a past slot is past for everyone, and so never shows as taken or free.
 * - With no practitioners, every day is closed; the week's frame (weekStart, previous/next week, closure notes on
 *   closed-by-closure days) comes from buildWeekAvailability with no hours, so it still matches a single calendar.
 */
export function buildClinicWeek(input: BuildClinicWeekInput): ClinicWeek {
  const { practitioners, ...common } = input;

  const weeks: PractitionerWeek[] = practitioners.map((practitioner) => ({
    id: practitioner.id,
    availability: buildWeekAvailability({
      ...common,
      hours: practitioner.hours,
      closures: [...input.closures, ...practitioner.leave.map((leave) => ({ ...leave, note: null }))],
      busy: practitioner.busy,
    }),
  }));

  // Every practitioner's week shares the same frame (it depends only on the common inputs), so any one will do. With
  // no practitioners, a calendar with no hours supplies it: every day below then has no open practitioner and is
  // closed, with the same notes buildWeekAvailability would give.
  const frame = weeks[0]?.availability ?? buildWeekAvailability({ ...common, hours: [], busy: [] });
  const lastBookableDate = addDays(input.today, input.horizonDays - 1);
  const freeBySlot = new Map<string, readonly string[]>();

  const days: SiteAvailabilityDay[] = frame.days.map((frameDay, dayIndex) => {
    const date = frameDay.date;
    const openDays = weeks
      .map((week) => ({ id: week.id, day: week.availability.days[dayIndex] }))
      .filter((entry): entry is { id: string; day: SiteAvailabilityDay } => entry.day !== undefined && !entry.day.closed);

    if (openDays.length === 0) {
      const closedNote = date > lastBookableDate ? null : (closureOn(input.closures, date)?.note ?? null);
      return { date, closed: true, closedNote, slots: [] };
    }

    const merged = new Map<string, { end: string; states: SiteSlotState[]; free: string[] }>();
    for (const { id, day } of openDays) {
      for (const slot of day.slots) {
        const entry = merged.get(slot.start) ?? { end: slot.end, states: [], free: [] };
        entry.states.push(slot.state);
        if (slot.state === "free") entry.free.push(id);
        merged.set(slot.start, entry);
      }
    }

    const slots: SiteSlot[] = [...merged.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([start, entry]) => {
        if (entry.free.length > 0) freeBySlot.set(slotKey(date, start), entry.free);
        return { start, end: entry.end, state: mergedState(entry.states) };
      });

    return { date, closed: false, closedNote: null, slots };
  });

  return {
    availability: {
      weekStart: frame.weekStart,
      today: frame.today,
      slotMinutes: frame.slotMinutes,
      previousWeek: frame.previousWeek,
      nextWeek: frame.nextWeek,
      days,
    },
    freeBySlot,
  };
}

/** Free when anyone is free, else taken when anyone is booked, else past. */
function mergedState(states: readonly SiteSlotState[]): SiteSlotState {
  if (states.includes("free")) return "free";
  if (states.includes("taken")) return "taken";
  return "past";
}

/** Practitioner ids free for the slot at `date`/`start`, in `practitioners` order; empty for an unknown slot. */
export function freePractitionersAt(week: ClinicWeek, date: string, start: string): readonly string[] {
  return week.freeBySlot.get(slotKey(date, start)) ?? [];
}
