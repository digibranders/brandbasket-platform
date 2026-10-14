/** Turns the details panel's raw `FormData` into typed commands, pure and independent of the database and of
 * `"use server"` -- see actions.ts, whose job is only to check access, run the command against the tenant-scoped
 * transaction, and translate the outcome back into a form state. */
import { z } from "zod";
import type { AppointmentRow, AppointmentTransition, ReassignResult } from "@fynix/db";
import { CANCEL_REASON_MAX_LENGTH } from "@fynix/shared/lib/appointments/limits";
import { isAppointmentAction } from "@fynix/shared/lib/appointments/status";
import { textField, type FormParseResult } from "@fynix/shared/lib/form-result";
import { cleanLine } from "@fynix/shared/lib/validation/text";

export interface TransitionCommand {
  readonly appointmentId: string;
  readonly transition: AppointmentTransition;
}

const RAW_TRANSITION_SCHEMA = z.object({ appointmentId: z.uuid(), action: z.string(), reason: z.string() });

const NOT_FOUND_RESULT: FormParseResult<never> = {
  success: false,
  field: null,
  message: "That booking could not be found. Refresh the page and try again.",
};

/** Parses the details panel's Cancel, Attended and No-show forms -- all three post to the same action,
 * distinguished by their hidden `action` field. Cancel's reason is optional and capped; the two outcomes need
 * nothing further. */
export function parseTransitionCommand(formData: FormData): FormParseResult<TransitionCommand> {
  const raw = RAW_TRANSITION_SCHEMA.safeParse({
    appointmentId: textField(formData, "appointmentId"),
    action: textField(formData, "action"),
    reason: textField(formData, "reason"),
  });
  if (!raw.success) return NOT_FOUND_RESULT;
  const { appointmentId, action } = raw.data;

  if (!isAppointmentAction(action)) return NOT_FOUND_RESULT;

  if (action === "cancel") {
    const reason = cleanLine(raw.data.reason);
    if (reason.length > CANCEL_REASON_MAX_LENGTH) {
      return { success: false, field: "reason", message: `Keep the reason to ${String(CANCEL_REASON_MAX_LENGTH)} characters.` };
    }
    return { success: true, data: { appointmentId, transition: { action: "cancel", reason: reason === "" ? null : reason } } };
  }

  return { success: true, data: { appointmentId, transition: { action } } };
}

export interface ReassignCommand {
  readonly appointmentId: string;
  readonly practitionerId: string;
}

const RAW_REASSIGN_SCHEMA = z.object({ appointmentId: z.uuid(), practitionerId: z.string() });

/** Parses the details panel's Reassign form: the booking, and the doctor chosen from its select. An empty choice
 * is the one refusal that names a field; anything else malformed is the same not-found as a stale booking. */
export function parseReassignCommand(formData: FormData): FormParseResult<ReassignCommand> {
  const raw = RAW_REASSIGN_SCHEMA.safeParse({
    appointmentId: textField(formData, "appointmentId"),
    practitionerId: textField(formData, "practitionerId"),
  });
  if (!raw.success) return NOT_FOUND_RESULT;
  if (raw.data.practitionerId === "") return { success: false, field: "practitionerId", message: "Choose a doctor." };
  if (!z.uuid().safeParse(raw.data.practitionerId).success) return NOT_FOUND_RESULT;
  return { success: true, data: { appointmentId: raw.data.appointmentId, practitionerId: raw.data.practitionerId } };
}

/** What a reassign came to: `not_free` is this command's own refusal (the target isn't working then, or already
 * has something booked); the other three are reassignAppointment's (packages/db), passed through. */
export type ReassignOutcome = ReassignResult | "not_free";

/** The reads and the write a reassign needs, as functions over the caller's one tenant-scoped transaction --
 * actions.ts binds them to it, the tests to plain fakes. */
export interface ReassignPorts {
  readonly findBooking: (appointmentId: string) => Promise<AppointmentRow | null>;
  /** Every active doctor other than the booking's own who is free for its exact slot (lib/server/free-doctors.ts). */
  readonly freeDoctorIds: (booking: AppointmentRow) => Promise<readonly string[]>;
  readonly reassign: (appointmentId: string, practitionerId: string) => Promise<ReassignResult>;
}

/**
 * Moves a booking to another doctor, but only one who is actually free then. reassignAppointment checks overlap,
 * that the target is active and the same business's, all under the booking lock -- but not whether the target
 * *works* at that time, which is the slot engine's question, asked here first. The select the form posted from
 * only ever offered free doctors, but that list is as old as the page: hours, leave and bookings can all change
 * before submit, and a hand-built request can name anyone, so the submitted id is re-checked from scratch.
 *
 * A booking that is gone, no longer booked, or already started is `not_found` before any availability is worked
 * out -- reassignAppointment would refuse it the same way, and "that doctor isn't free" would be the wrong reason.
 *
 * Known, accepted gap: the working-hours check (freeDoctorIds) runs before reassignAppointment takes the
 * 'appointments:' lock, while overlap, "still active" and "same business" are re-checked under it. So an edit to
 * the target's hours or leave landing in the milliseconds between the two can let a reassign through onto a time
 * that doctor has just stopped working. Low risk -- a staff member editing hours at the very moment another
 * reassigns onto that doctor -- and the result is a visible booking the clinic can move again, never a double
 * booking; not worth widening the lock to hours and leave writes.
 */
export async function runReassignCommand(command: ReassignCommand, now: Date, ports: ReassignPorts): Promise<ReassignOutcome> {
  const booking = await ports.findBooking(command.appointmentId);
  if (booking === null || booking.status !== "booked" || booking.startsAt.getTime() <= now.getTime()) return "not_found";

  const free = await ports.freeDoctorIds(booking);
  if (!free.includes(command.practitionerId)) return "not_free";

  return ports.reassign(booking.id, command.practitionerId);
}
