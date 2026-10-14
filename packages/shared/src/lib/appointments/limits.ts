/** Length limits the clinic dashboard's own booking-detail forms enforce -- as opposed to booking-form.ts's
 * limits, which bound what a patient submits from the client site. The dashboard's cancel-reason and clinic-note
 * inputs, and the server action that parses them, both read these, so the two can never drift apart. Counts
 * UTF-16 code units, the same as an HTML input's `maxlength`.
 *
 * packages/db cannot import @firstfold/shared (the dependency points the other way), so the database's own checks
 * stay as literal numbers; these are for the platform app only. */
export const CANCEL_REASON_MAX_LENGTH = 200;
export const CLINIC_NOTE_MAX_LENGTH = 500;
