import type { AppointmentRow } from "@firstfold/db";
import type { LeaveClash } from "./leave-added-state";

/** The appointment fields closureClashes reads: a subset of AppointmentRow, so tests need not build a whole row. */
export type ClashCandidate = Pick<
  AppointmentRow,
  "id" | "practitionerId" | "patientName" | "localDate" | "localStart" | "localEnd" | "status"
>;

/**
 * The bookings a clinic now has to deal with after closing on `closure`'s days: every doctor's, still booked (a
 * cancelled one needs nothing, and an attended or no-show one is already past), on a day inside the closure, both
 * ends included. Closing still saves over them -- nothing is cancelled and no patient is told automatically -- so the
 * clinic is shown each one straight away and can reassign, cancel or ring the patient knowingly. `rows` is
 * listAppointmentsForDates' result for the closure's own dates, already in date-then-time order, which this keeps.
 * The same shape as a doctor's leave over bookings (LeaveClash), so one list shows both.
 */
export function closureClashes(
  rows: readonly ClashCandidate[],
  closure: { readonly startsOn: string; readonly endsOn: string },
): LeaveClash[] {
  return rows
    .filter((row) => row.status === "booked" && row.localDate >= closure.startsOn && row.localDate <= closure.endsOn)
    .map((row) => ({
      appointmentId: row.id,
      patientName: row.patientName,
      localDate: row.localDate,
      localStart: row.localStart,
      localEnd: row.localEnd,
    }));
}
