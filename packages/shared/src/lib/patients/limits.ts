/** Length and count limits for the clinic's patient register. The dashboard's inputs (`maxLength`) and the server
 * parsers in patient-form.ts both read these, so the two cannot drift apart. Lengths count UTF-16 code units, the
 * same as an HTML input's `maxlength`.
 *
 * Kept free of imports so client components can use them: patient-form.ts is server-only (it parses phones).
 * packages/db cannot import @fynix/shared, so the database's own checks repeat these as literal numbers. */

/** The same 80 as a name a patient types when booking online (appointments/booking-form.ts NAME_MAX_LENGTH): the
 * register's name starts as a booking's name, so a longer limit here could never be filled from a booking. */
export const PATIENT_NAME_MAX_LENGTH = 80;

/** Tags are short labels ("VIP", "Needs wheelchair"), not notes: short enough to leave no room for medical detail. */
export const PATIENT_TAG_MAX_LENGTH = 24;

export const PATIENT_TAGS_MAX = 5;

/** A search is a name or a phone number; anything longer is cut, not refused. */
export const PATIENT_SEARCH_MAX_LENGTH = 80;
