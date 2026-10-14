/**
 * Failures specific to Appointments. The generic pieces -- isCheckViolation, paymentRequiredState,
 * unexpectedErrorState -- live in lib/server/panel-form-errors.ts, shared with "Your details" (and errorLogInfo
 * in @fynix/shared/server/error-log-info, shared more widely still); this file keeps only what's particular to the week grid
 * and settings pages.
 */
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const MODULE_OFF_MESSAGE = "Appointments are switched off for your business.";
export const ALREADY_UPDATED_MESSAGE = "This booking was already updated. Refresh to see it.";
export const NOT_FOUND_MESSAGE = "That could not be found. Reload the page.";
export const NOT_STARTED_MESSAGE = "You can record this once the appointment has started.";
export const DOCTOR_NOT_FREE_MESSAGE = "That doctor isn't free then.";

/** The Appointments module was switched off between page load and submit. */
export function moduleOffState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: MODULE_OFF_MESSAGE, field: null }, formData);
}

/** `transitionAppointment` found the row already moved on (or gone) by the time this submit reached it -- a
 * teammate acting on the same booking, most likely. */
export function alreadyUpdatedState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: ALREADY_UPDATED_MESSAGE, field: null }, formData);
}

/** Settings/actions.ts's catch-all "that row is gone" refusal: a service id that was either not a UUID or named
 * no row of this business's (the same message either way, so it never reveals which), or a settings update that
 * found no settings row to update at all (in practice unreachable once the module is on, since switching it on
 * seeds one in the same transaction -- see setBusinessModule). */
export function notFoundState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: NOT_FOUND_MESSAGE, field: null }, formData);
}

/** An Attended or No-show submitted for a booking whose slot hasn't started yet -- `transitionAppointment`'s `done`
 * and `no_show` edges enforce `starts_at <= now` themselves and return null the same way they would for any other
 * disallowed transition, so the action re-checks with `canRecordOutcome` (lib/appointments/booking-actions.ts)
 * first to tell this apart from a genuinely stale booking and explain what's actually blocking it, rather than the
 * generic "already updated". */
export function notStartedState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: NOT_STARTED_MESSAGE, field: null }, formData);
}

/** A reassign to a doctor who can't take the slot after all: not working then (hours, leave, a closure), or
 * already booked -- either spotted by the action's own free-doctor check, or by reassignAppointment's overlap check
 * under the booking lock (`taken`). One message for both: to the clinic it is the same fact about that doctor. */
export function doctorNotFreeState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: DOCTOR_NOT_FREE_MESSAGE, field: "practitionerId" }, formData);
}
