import Link from "next/link";
import type { ReactElement } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";

interface AddBookingDayPickerProps {
  /** The day on screen, YYYY-MM-DD. */
  readonly date: string;
  /** Its heading, e.g. "Thursday 1 October". */
  readonly dateLabel: string;
  /** The first and last days reception may book, for the date input's own bounds. */
  readonly minDate: string;
  readonly maxDate: string;
  /** Null hides the link: there is no bookable day on that side. */
  readonly previousHref: string | null;
  readonly todayHref: string;
  readonly nextHref: string | null;
  readonly isToday: boolean;
  /** Carried through the date form, so jumping to a day keeps the chosen doctor and Book again's patient. */
  readonly doctor: string | null;
  readonly patient: string | null;
}

const DATE_INPUT_CLASSES =
  "mt-1.5 block rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent";

/**
 * Add booking's day: its heading with Previous / Today / Next, and a plain GET form for jumping to any date --
 * server-rendered HTML like CustomRangeForm, so it works with or without JavaScript. Changing day drops any picked
 * time, since a time only means something on its own day.
 */
export function AddBookingDayPicker({
  date,
  dateLabel,
  minDate,
  maxDate,
  previousHref,
  todayHref,
  nextHref,
  isToday,
  doctor,
  patient,
}: AddBookingDayPickerProps): ReactElement {
  return (
    <div className="mt-6 border-b border-line pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="panel-section">{dateLabel}</h2>
        <nav aria-label="Day" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {previousHref === null ? null : (
            <Link href={previousHref} className="link-underline text-ink">
              Previous
            </Link>
          )}
          <Link href={todayHref} aria-current={isToday ? "date" : undefined} className="link-underline text-ink">
            Today
          </Link>
          {nextHref === null ? null : (
            <Link href={nextHref} className="link-underline text-ink">
              Next
            </Link>
          )}
        </nav>
      </div>
      <form action="/appointments/new" method="get" className="mt-4 flex flex-wrap items-end gap-3">
        {doctor === null ? null : <input type="hidden" name="doctor" value={doctor} />}
        {patient === null ? null : <input type="hidden" name="patient" value={patient} />}
        <div>
          <label htmlFor="add-booking-date" className="block text-[0.8125rem] font-medium text-ink-soft">
            Day <RequiredMark />
          </label>
          {/* Keyed on the day so a Previous/Next navigation redraws the input with the new day, not the old one. */}
          <input
            key={date}
            id="add-booking-date"
            name="date"
            type="date"
            required
            defaultValue={date}
            min={minDate}
            max={maxDate}
            className={DATE_INPUT_CLASSES}
          />
        </div>
        <SubmitButton size="sm" variant="secondary">
          Go
        </SubmitButton>
      </form>
    </div>
  );
}
