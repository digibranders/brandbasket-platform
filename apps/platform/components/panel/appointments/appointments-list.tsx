import Link from "next/link";
import type { ReactElement } from "react";
import type { AppointmentRow } from "@brandbasket/db";
import { slotLabel } from "@brandbasket/shared/lib/appointments/slots";
import { APPOINTMENT_STATUS_LABELS } from "@brandbasket/shared/lib/appointments/status";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { formatLongDate } from "@/lib/appointments/date-format";
import { groupByDate, serialNumbersById } from "@/lib/appointments/view-ranges";
import { PractitionerBadge } from "./practitioner-badge";
import { StatusLabel } from "./status-label";

interface AppointmentsListProps {
  /** Already capped to whatever the caller wants to actually render (see the appointments page's own 500-row
   * cap) -- this renders exactly what it's given, in the order given. Each row's "Sr no" numbers this array's
   * positions 1..length, running continuously across date groups rather than restarting at each one. */
  readonly appointments: readonly AppointmentRow[];
  /** The current view's own query string (e.g. "/appointments?view=month&month=2026-09"), no `booking` -- each
   * row appends its own `&booking=<id>` to this. */
  readonly baseHref: string;
  readonly currentYear: number;
  /** Month and Custom group rows under a heading per date; Today is a single day already, so it renders a flat
   * list with no headings of its own. */
  readonly groupByDay: boolean;
  /** Doctor names by practitioner id when the page is showing every doctor of a clinic with two or more -- each
   * row then carries its doctor's initials before the patient's name. Null otherwise: nothing new shows. */
  readonly doctorNames: ReadonlyMap<string, string> | null;
}

/** "+91 98765 43210 · Sports injury rehab", or just the service for an erased booking, which has no phone. */
function detailLine(appointment: AppointmentRow): string {
  const service = appointment.serviceName ?? "Any service";
  const phone = displayPhoneText(appointment.phone);
  return phone === null || phone === "" ? service : `${phone} · ${service}`;
}

function bookingHref(baseHref: string, id: string): string {
  return `${baseHref}&booking=${id}`;
}

/** "Arjun Menon, Sports injury rehab, Monday 28 September 09:00 – 09:30, with Dr Rahul Menon, Booked" (the doctor
 * only when the row shows their initials), with ", new" appended --
 * everything the row shows visually (time, name, phone, service, status) is represented here too, spelled out in
 * full. Mirrors appointments-grid.tsx's own cellAriaLabel, adapted for a list row that also needs its status
 * spelled out (the grid instead colours a whole cell and never shows "Booked" as text). */
function rowAriaLabel(appointment: AppointmentRow, currentYear: number, isNew: boolean, doctorName: string | null): string {
  const doctor = doctorName === null ? "" : `, with ${doctorName}`;
  const base = `${appointment.patientName}, ${appointment.serviceName ?? "Any service"}, ${formatLongDate(appointment.localDate, currentYear)} ${slotLabel(appointment.localStart, appointment.localEnd)}${doctor}, ${APPOINTMENT_STATUS_LABELS[appointment.status]}`;
  return isNew ? `${base}, new` : base;
}

function AppointmentListRow({
  appointment,
  baseHref,
  currentYear,
  srNo,
  total,
  doctorName,
}: {
  readonly appointment: AppointmentRow;
  readonly baseHref: string;
  readonly currentYear: number;
  /** This row's 1-based position in the whole (capped) list, continuous across date groups -- the "Sr no" column
   * and the aria-label's "Booking N of total" prefix both read from this. */
  readonly srNo: number;
  readonly total: number;
  readonly doctorName: string | null;
}): ReactElement {
  const isNew = appointment.status === "booked" && appointment.seenAt === null;

  return (
    <li>
      <Link
        href={bookingHref(baseHref, appointment.id)}
        prefetch={false}
        aria-label={`Booking ${String(srNo)} of ${String(total)}: ${rowAriaLabel(appointment, currentYear, isNew, doctorName)}`}
        className="-mx-2 flex items-start gap-3 rounded-control px-2 py-2.5 transition-colors duration-300 ease-calm hover:bg-paper-deep/60"
      >
        {/* Fixed-width and right-aligned so every row's time starts at the same x position regardless of how many
            digits its own number has -- announced through the aria-label above, not read a second time here. */}
        <span aria-hidden="true" className="w-8 shrink-0 pt-px text-right text-xs tabular-nums text-ink-soft">
          {srNo}.
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink">
              <span className="tabular-nums">{slotLabel(appointment.localStart, appointment.localEnd)} ·</span>
              {doctorName === null ? null : <PractitionerBadge name={doctorName} tone="accent" size="sm" />}
              <span>{appointment.patientName}</span>
            </span>
            <StatusLabel status={appointment.status} isNew={isNew} />
          </span>
          <span className="mt-0.5 block text-sm tabular-nums text-ink-soft">
            {detailLine(appointment)}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The Today/Month/Custom views' shared row list: a flat, hairline-separated list of bookings (any status --
 * cancelled ones are records too, shown muted rather than left out), or the same list grouped under a
 * hairline-separated heading per date. Callers check `appointments.length === 0` themselves and render their own
 * (view-specific) empty-state line instead of this. */
export function AppointmentsList({ appointments, baseHref, currentYear, groupByDay, doctorNames }: AppointmentsListProps): ReactElement {
  const doctorNameOf = (appointment: AppointmentRow): string | null =>
    doctorNames === null ? null : (doctorNames.get(appointment.practitionerId) ?? null);
  const total = appointments.length;
  // Keyed by id rather than derived from render position, so numbering stays 1..total continuously across
  // groupByDate's date groups below instead of restarting at each one -- see serialNumbersById's own doc comment.
  const srNoById = serialNumbersById(appointments);

  if (!groupByDay) {
    return (
      <ul className="mt-3 divide-y divide-line">
        {appointments.map((appointment) => (
          <AppointmentListRow
            key={appointment.id}
            appointment={appointment}
            baseHref={baseHref}
            currentYear={currentYear}
            srNo={srNoById.get(appointment.id) ?? 0}
            total={total}
            doctorName={doctorNameOf(appointment)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-3 space-y-6">
      {groupByDate(appointments).map((group) => (
        <div key={group.date}>
          <h3 className="border-b border-line pb-2 text-sm font-medium text-ink">{formatLongDate(group.date, currentYear)}</h3>
          <ul className="divide-y divide-line">
            {group.rows.map((appointment) => (
              <AppointmentListRow
                key={appointment.id}
                appointment={appointment}
                baseHref={baseHref}
                currentYear={currentYear}
                srNo={srNoById.get(appointment.id) ?? 0}
                total={total}
                doctorName={doctorNameOf(appointment)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
