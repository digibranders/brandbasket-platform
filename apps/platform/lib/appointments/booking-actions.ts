/** Whether the clinic dashboard's outcome buttons (Attended and No-show) apply to a booking right now. Pure, so both
 * the details panel (to decide whether to show the buttons at all) and the server action (to turn a guarded-off
 * attempt into a clear message rather than a generic "already updated") agree on exactly the same rule --
 * `transitionAppointment`'s `done` and `no_show` edges (packages/db/src/queries/appointments.ts) enforce the same
 * `starts_at <= now` condition at the database layer, so this is a UI-facing mirror of that rule, not the only
 * place it's held. */
import type { AppointmentRow } from "@brandbasket/db";

export function canRecordOutcome(appointment: Pick<AppointmentRow, "status" | "startsAt">, now: Date): boolean {
  return appointment.status === "booked" && appointment.startsAt.getTime() <= now.getTime();
}
