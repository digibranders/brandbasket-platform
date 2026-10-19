import Link from "next/link";
import type { ReactElement } from "react";
import type { AppointmentRow } from "@brandbasket/db";
import { slotLabel } from "@brandbasket/shared/lib/appointments/slots";
import { APPOINTMENT_STATUS_LABELS } from "@brandbasket/shared/lib/appointments/status";
import { appointmentHref } from "@/app/app-host/(protected)/patients/view";
import { formatLongDate } from "@/lib/appointments/date-format";
import { StatusLabel } from "@/components/panel/appointments/status-label";

interface PatientHistoryProps {
  /** Every booking of the patient, newest first (listPatientAppointments' order), whatever its outcome. */
  readonly appointments: readonly AppointmentRow[];
  readonly currentYear: number;
  /** The doctor to name on a booking, or null to name none (bookingDoctorName's rule: only once a clinic has had
   * two doctors). */
  readonly doctorNameOf: (appointment: AppointmentRow) => string | null;
}

/** "Monday 28 September, 09:00 – 09:30 · Sports injury rehab · With Dr Rahul Menon · Attended", the whole row for a
 * screen reader in the order it is seen. */
function rowAriaLabel(appointment: AppointmentRow, currentYear: number, doctorName: string | null): string {
  const doctor = doctorName === null ? "" : `, with ${doctorName}`;
  return `${formatLongDate(appointment.localDate, currentYear)}, ${slotLabel(appointment.localStart, appointment.localEnd)}, ${appointment.serviceName ?? "Any service"}${doctor}, ${APPOINTMENT_STATUS_LABELS[appointment.status]}`;
}

/** One booking, as a link to its details in Appointments. Shared by the history list and the Next appointment line. */
export function PatientBookingLink({
  appointment,
  currentYear,
  doctorName,
}: {
  readonly appointment: AppointmentRow;
  readonly currentYear: number;
  readonly doctorName: string | null;
}): ReactElement {
  return (
    <Link
      href={appointmentHref(appointment)}
      prefetch={false}
      aria-label={rowAriaLabel(appointment, currentYear, doctorName)}
      className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-control px-2 py-2.5 text-sm transition-colors duration-300 ease-calm hover:bg-paper-deep/60"
    >
      <span className="min-w-0">
        <span className="block font-medium tabular-nums text-ink">
          {formatLongDate(appointment.localDate, currentYear)}, {slotLabel(appointment.localStart, appointment.localEnd)}
        </span>
        <span className="mt-0.5 block text-ink-soft">
          {appointment.serviceName ?? "Any service"}
          {doctorName === null ? "" : ` · ${doctorName}`}
        </span>
      </span>
      <StatusLabel status={appointment.status} />
    </Link>
  );
}

/** A patient's every booking, newest first, each opening that booking in Appointments. */
export function PatientHistory({ appointments, currentYear, doctorNameOf }: PatientHistoryProps): ReactElement {
  if (appointments.length === 0) return <p className="mt-3 text-sm text-ink-soft">No bookings.</p>;
  return (
    <ul className="mt-3 divide-y divide-line">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <PatientBookingLink appointment={appointment} currentYear={currentYear} doctorName={doctorNameOf(appointment)} />
        </li>
      ))}
    </ul>
  );
}
