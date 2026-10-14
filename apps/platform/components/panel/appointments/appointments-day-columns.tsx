import Link from "next/link";
import type { ReactElement } from "react";
import type { AppointmentRow } from "@firstfold/db";
import { slotLabel } from "@firstfold/shared/lib/appointments/slots";
import { APPOINTMENT_STATUS_LABELS } from "@firstfold/shared/lib/appointments/status";
import { cn } from "@firstfold/shared/lib/cn";
import { TickIcon } from "@firstfold/shared/ui/icons";
import type { DayColumns } from "@/lib/appointments/doctors-view";
import { firstName } from "@/lib/appointments/grid";
import { PractitionerBadge } from "./practitioner-badge";

interface AppointmentsDayColumnsProps {
  readonly columns: DayColumns<AppointmentRow>;
  /** The Today view's own query string, no `booking` -- each card appends its own `&booking=<id>`. */
  readonly baseHref: string;
  /** "Monday 28 September" -- the page's own day heading, repeated as the table's sr-only caption. */
  readonly dayLabel: string;
}

/** Same widths as the week grid's time column, so the two views' time labels line up when switching between them. */
const TIME_COLUMN_WIDTH = "7.5rem";

/** "Arjun Menon, Sports injury rehab, 09:00 – 09:30, with Dr Rahul Menon, Booked", with ", new" appended. */
function cardAriaLabel(booking: AppointmentRow, doctorName: string, isNew: boolean): string {
  const base = `${booking.patientName}, ${booking.serviceName ?? "Any service"}, ${slotLabel(booking.localStart, booking.localEnd)}, with ${doctorName}, ${APPOINTMENT_STATUS_LABELS[booking.status]}`;
  return isNew ? `${base}, new` : base;
}

/**
 * One booking in a doctor's column. Styled like the week grid's cards -- accent for booked, muted with a tick for
 * attended, muted and labelled "No-show" in words for a no-show -- plus a quieter look for cancelled: Today is a
 * record of the day (the list it stands in for shows cancelled bookings too), so a cancelled one stays visible,
 * struck through, rather than vanishing from the column.
 */
function DayCard({ booking, baseHref, doctorName }: { readonly booking: AppointmentRow; readonly baseHref: string; readonly doctorName: string }): ReactElement {
  const isNew = booking.status === "booked" && booking.seenAt === null;
  const done = booking.status === "done";
  const noShow = booking.status === "no_show";
  const cancelled = booking.status === "cancelled";

  return (
    <Link
      href={`${baseHref}&booking=${booking.id}`}
      prefetch={false}
      aria-label={cardAriaLabel(booking, doctorName, isNew)}
      className={cn(
        "flex min-h-9 w-full min-w-0 flex-col gap-0.5 rounded-control px-2.5 py-1.5 text-left text-xs font-medium transition-colors duration-300 ease-calm",
        cancelled
          ? "text-ink-soft hover:bg-paper-deep"
          : done || noShow
            ? "bg-paper-deep text-ink-soft hover:bg-line"
            : "bg-accent text-paper hover:bg-accent-deep",
      )}
    >
      <span className={cn("block min-w-0 truncate", cancelled && "line-through")}>
        {firstName(booking.patientName)} · {booking.serviceName ?? "Any service"}
      </span>
      <span className={cn("flex min-w-0 items-center gap-1 text-xs font-normal tabular-nums", booking.status === "booked" ? "text-paper" : "text-ink-soft")}>
        {done ? <TickIcon className="size-3 shrink-0" /> : null}
        <span className="truncate">{cancelled ? APPOINTMENT_STATUS_LABELS.cancelled : `${booking.localStart}–${booking.localEnd}`}</span>
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

/**
 * The Today view for a clinic with several doctors, showing all of them: a column per doctor (their initials and
 * name at the top), a row per booked start time, so "who is seeing whom at 3" reads straight across. Hairlines
 * only, like the week grid. Rows come from the day's bookings rather than the slot grid -- see buildDayColumns.
 *
 * Wide screens only: the page renders the plain list (with each row's initials) below `md` instead, since several
 * columns side by side on a phone would each be too narrow to read a name in.
 */
export function AppointmentsDayColumns({ columns, baseHref, dayLabel }: AppointmentsDayColumnsProps): ReactElement {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{dayLabel}, by doctor</caption>
        <colgroup>
          <col style={{ width: TIME_COLUMN_WIDTH }} />
          {columns.doctors.map((doctor) => (
            <col key={doctor.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-ink-soft">
              <span className="sr-only">Time</span>
            </th>
            {columns.doctors.map((doctor) => (
              <th key={doctor.id} scope="col" className="px-3 py-3 text-left text-sm font-medium text-ink">
                <span className="flex min-w-0 items-center gap-2">
                  <PractitionerBadge name={doctor.name} tone="accent" size="md" />
                  <span className="truncate">{doctor.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {columns.times.map((time) => (
            <tr key={time.start}>
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left align-top text-xs font-medium tabular-nums text-ink-soft">
                {slotLabel(time.start, time.end)}
              </th>
              {columns.doctors.map((doctor) => {
                const bookings = columns.cell(doctor.id, time.start);
                return (
                  <td key={doctor.id} className="px-1.5 py-1.5 align-top">
                    {bookings.length === 0 ? (
                      <div className="h-9" aria-hidden="true" />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {bookings.map((booking) => (
                          <DayCard key={booking.id} booking={booking} baseHref={baseHref} doctorName={doctor.name} />
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
