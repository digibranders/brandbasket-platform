import Link from "next/link";
import type { ReactElement } from "react";
import type { AppointmentRow } from "@brandbasket/db";
import { slotLabel } from "@brandbasket/shared/lib/appointments/slots";
import { APPOINTMENT_STATUS_LABELS } from "@brandbasket/shared/lib/appointments/status";
import { cn } from "@brandbasket/shared/lib/cn";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { formatGridDayLabel, formatLongDate } from "@/lib/appointments/date-format";
import { cellKey, firstName, type GridDay, type GridRow } from "@/lib/appointments/grid";
import { PractitionerBadge } from "./practitioner-badge";

interface AppointmentsGridProps {
  readonly rows: readonly GridRow[];
  readonly days: readonly GridDay[];
  /** This week's appointments, any status -- cancelled ones are filtered out here (they're listed separately, see
   * "Cancelled this week" on the page) rather than shown as an occupied cell. */
  readonly appointments: readonly AppointmentRow[];
  /** The current view's own query string, no `booking` (e.g. "/appointments?view=week&week=2026-09-28&doctor=..."):
   * each cell appends its own `&booking=<id>`, so opening a booking keeps the doctor filter it was opened under. */
  readonly baseHref: string;
  readonly currentYear: number;
  /** Doctor names by practitioner id when the page is showing every doctor of a clinic with two or more -- each
   * card then carries its doctor's initials. Null otherwise (one doctor, or one doctor chosen): nothing new shows. */
  readonly doctorNames: ReadonlyMap<string, string> | null;
  /** "28 Sep – 4 Oct 2026" -- the page's own week-range heading, repeated here as the table's (sr-only) caption
   * so the grid still names the week it shows to anyone navigating it directly, without the visible heading. */
  readonly weekRangeLabel: string;
}

function bookingHref(baseHref: string, bookingId: string): string {
  return `${baseHref}&booking=${bookingId}`;
}

/** "09:00" and "09:30" become "09:00–09:30" -- the compact form a cell's own time shows, deliberately tighter than
 * slotLabel's "09:00 – 09:30" (used everywhere a full sentence reads it, e.g. aria-label and the details panel):
 * this sits inside an already-narrow grid cell next to a name and a service. It exists mainly for a booking whose
 * start doesn't match the row it's rendered in -- the clinic's slot length changed since it was made -- so the
 * booking's own time is never just implied by which row it happens to sit in. */
function compactTime(start: string, end: string): string {
  return `${start}–${end}`;
}

/** "Arjun Menon, Sports injury rehab, Monday 28 September 09:00 – 09:30", with ", with Dr Rahul Menon" when the
 * card shows its doctor's initials, and ", new", ", Attended" or ", No-show" appended -- everything the cell shows
 * visually (the patient's first name, the service, its own time, the doctor, its outcome) is represented here too,
 * just spelled out in full rather than abbreviated for a narrow cell. */
function cellAriaLabel(booking: AppointmentRow, currentYear: number, isNew: boolean, doctorName: string | null): string {
  const doctor = doctorName === null ? "" : `, with ${doctorName}`;
  const base = `${booking.patientName}, ${booking.serviceName ?? "Any service"}, ${formatLongDate(booking.localDate, currentYear)} ${slotLabel(booking.localStart, booking.localEnd)}${doctor}`;
  if (booking.status !== "booked") return `${base}, ${APPOINTMENT_STATUS_LABELS[booking.status]}`;
  return isNew ? `${base}, new` : base;
}

/** One occupied cell: booked (accent-filled, links to the details panel), or finished -- attended (muted with a
 * tick) or a no-show (muted, labelled "No-show" in words so it never relies on colour or an icon alone). Finished
 * cells link to the details panel too, for the patient's contact details. An unseen booked cell also carries a
 * small "New" label (see markAppointmentSeen, stamped the moment its details panel is opened).
 *
 * Two lines, sized to shrink with the column rather than force it wider: "Name · Service" first, a single run of
 * text so `truncate` actually ellipsizes it (a flex row of separate name/badge items wouldn't -- see the "New"
 * badge's second line below instead), then the slot's own time on its own line, with "New" or the tick icon beside
 * it rather than competing with the name for space.
 */
function OccupiedCell({
  booking,
  baseHref,
  currentYear,
  doctorName,
}: {
  readonly booking: AppointmentRow;
  readonly baseHref: string;
  readonly currentYear: number;
  /** Shown as initials before the name when set -- see AppointmentsGridProps.doctorNames. */
  readonly doctorName: string | null;
}): ReactElement {
  const isNew = booking.status === "booked" && booking.seenAt === null;
  const time = compactTime(booking.localStart, booking.localEnd);
  const ariaLabel = cellAriaLabel(booking, currentYear, isNew, doctorName);
  const done = booking.status === "done";
  const noShow = booking.status === "no_show";
  const muted = done || noShow;

  return (
    <Link
      href={bookingHref(baseHref, booking.id)}
      prefetch={false}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-9 w-full min-w-0 flex-col gap-0.5 rounded-control px-2 py-1.5 text-left text-xs font-medium transition-colors duration-300 ease-calm",
        muted ? "bg-paper-deep text-ink-soft hover:bg-line" : "bg-accent text-paper hover:bg-accent-deep",
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        {doctorName === null ? null : <PractitionerBadge name={doctorName} tone={muted ? "muted" : "onAccent"} size="sm" />}
        <span className="block min-w-0 truncate">
          {firstName(booking.patientName)} · {booking.serviceName ?? "Any service"}
        </span>
      </span>
      <span className={cn("flex min-w-0 items-center gap-1 text-xs font-normal tabular-nums", muted ? "text-ink-soft" : "text-paper")}>
        {done ? <TickIcon className="size-3 shrink-0" /> : null}
        <span className="truncate">{time}</span>
        {noShow ? (
          <span className="shrink-0 text-[0.6875rem] font-semibold text-ink">{APPOINTMENT_STATUS_LABELS.no_show}</span>
        ) : null}
        {isNew ? (
          <span className="shrink-0 rounded-full bg-paper/25 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-paper">New</span>
        ) : null}
      </span>
    </Link>
  );
}

/** The time column's fixed width, in a `<colgroup>` so `table-layout: fixed` divides everything else -- the 7 day
 * columns -- equally between them, regardless of how long a patient's name or service happens to be. */
const TIME_COLUMN_WIDTH = "7.5rem";

/** Below this, the 7 day columns can no longer shrink to anything legible; the table stops shrinking here and the
 * wrapper's own `overflow-x-auto` takes over instead. Above it (any normal desktop width, including with the
 * details panel open above the grid -- see the appointments page), the table fills its container at `w-full` with
 * no scrolling at all: table-layout: fixed gives every day column an equal share of whatever space that is. */
const GRID_MIN_WIDTH = "56.25rem"; // 900px

/**
 * The week schedule: one column per weekday with its date, one row per slot time. A closed day is annotated under
 * its date, in its own line from any closure note (a long note next to "Closed" in one line was wrapping
 * awkwardly in a column this narrow), with its whole column tinted -- rather than blanked out row by row, so a
 * stray booking on a day that's since been marked closed (hours changed, a closure added after the fact) still
 * shows rather than silently disappearing.
 *
 * Hairlines only: no boxed card around the table, matching the rest of the dashboard.
 */
export function AppointmentsGrid({ rows, days, appointments, baseHref, currentYear, weekRangeLabel, doctorNames }: AppointmentsGridProps): ReactElement {
  // A list per cell, not one booking: with several doctors, two bookings can share a slot (one per doctor), and
  // each needs its own card rather than the later one silently replacing the earlier. `appointments` arrives in
  // start order, so each cell's list does too.
  const byCell = new Map<string, AppointmentRow[]>();
  for (const booking of appointments) {
    if (booking.status === "cancelled") continue;
    const key = cellKey(booking.localDate, booking.localStart);
    const list = byCell.get(key) ?? [];
    list.push(booking);
    byCell.set(key, list);
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: GRID_MIN_WIDTH }}>
        <caption className="sr-only">{weekRangeLabel}</caption>
        <colgroup>
          <col style={{ width: TIME_COLUMN_WIDTH }} />
          {days.map((day) => (
            <col key={day.date} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky left-0 z-10 bg-paper px-3 py-2.5 text-left text-xs font-medium text-ink-soft">
              <span className="sr-only">Time</span>
            </th>
            {days.map((day) => (
              <th key={day.date} scope="col" className={cn("px-3 py-2.5 text-left text-xs font-medium tabular-nums text-ink-soft", day.closed && "bg-paper-deep")}>
                <div className="truncate text-ink">{formatGridDayLabel(day.date)}</div>
                {day.closed ? (
                  <div className="mt-0.5 font-normal normal-case text-ink-soft">
                    <div>Closed</div>
                    {day.closedNote === null ? null : (
                      <div className="truncate text-ink-soft" title={day.closedNote}>
                        {day.closedNote}
                      </div>
                    )}
                  </div>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.start}>
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-paper px-3 py-2 text-left text-xs font-medium tabular-nums text-ink-soft">
                {slotLabel(row.start, row.end)}
              </th>
              {days.map((day) => {
                const bookings = byCell.get(cellKey(day.date, row.start)) ?? [];
                return (
                  <td key={day.date} className={cn("px-1.5 py-1.5 align-top", day.closed && "bg-paper-deep")}>
                    {bookings.length === 0 ? (
                      <div className="h-9" aria-hidden="true" />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {bookings.map((booking) => (
                          <OccupiedCell
                            key={booking.id}
                            booking={booking}
                            baseHref={baseHref}
                            currentYear={currentYear}
                            doctorName={doctorNames === null ? null : (doctorNames.get(booking.practitionerId) ?? null)}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
