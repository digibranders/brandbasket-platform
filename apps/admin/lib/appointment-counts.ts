import type { AppointmentCounts } from "@brandbasket/db";

/** The staff console's one-line appointments summary, e.g. "3 upcoming · 12 total · 1 doctor". */
export function appointmentCountsLine(counts: AppointmentCounts): string {
  const doctors = `${String(counts.doctors)} ${counts.doctors === 1 ? "doctor" : "doctors"}`;
  return `${String(counts.upcoming)} upcoming · ${String(counts.total)} total · ${doctors}`;
}
