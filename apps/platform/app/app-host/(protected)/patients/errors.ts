/**
 * Refusals particular to the patient register. The generic pieces -- paymentRequiredState, unexpectedErrorState --
 * live in lib/server/panel-form-errors.ts; the parser refusals (a blank name, too many tags, a malformed id) come
 * from @brandbasket/shared's patients/patient-form.ts. This file keeps only what the register's own outcomes need:
 * each message here answers one outcome of a packages/db patients query, mapped in ./commands.ts.
 *
 * The module-off message repeats appointments/errors.ts's wording rather than importing it, so neither page depends
 * on the other's files (the same rule lib/panel-form-state.ts's history describes); to the clinic it is the one
 * Appointments module either way.
 */
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const MODULE_OFF_MESSAGE = "Appointments are switched off for your business.";
/** A patient (or, for a merge, either record) that is gone: merged away or deleted by a teammate since page load. */
export const PATIENT_GONE_MESSAGE = "That patient could not be found. Refresh the page and try again.";
/** The second phone is already a number of another patient: one number must lead a booking to one patient only. */
export const PHONE_IN_USE_MESSAGE = "That number belongs to another patient.";
/** The second phone typed is the patient's own main number. */
export const OWN_PHONE_MESSAGE = "That's already their main number.";
/** Merge lookup: no patient of this clinic has the number typed, as their phone or second phone. */
export const NO_MATCH_MESSAGE = "No patient has that number.";
/** Merge lookup: the number typed leads back to this same patient. */
export const SAME_PATIENT_MESSAGE = "That number is this patient's own.";
/** Merge confirm: both ids name one record (only a hand-built request can get this far). */
export const MERGE_SAME_MESSAGE = "Choose a different patient to merge.";
/** Delete, refused while the patient still has a booked visit ahead: erasing would leave the clinic a booking with
 * no one to call about it. */
export const HAS_UPCOMING_MESSAGE = "Cancel their upcoming booking first.";

/** The Appointments module (and with it the register) was switched off between page load and submit. */
export function moduleOffState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: MODULE_OFF_MESSAGE, field: null }, formData);
}
