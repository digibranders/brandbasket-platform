/** The names the patient forms post their inputs under, shared by the forms (client components) and the parsers in
 * patient-form.ts. Free of imports for the same reason as limits.ts: patient-form.ts is server-only.
 *
 * A phone is two inputs, like PhoneField: the number and the country it is dialled from. The patient's own phone
 * uses PhoneField's names ("phone" and PHONE_COUNTRY_FIELD, "phoneCountry"); the second phone mirrors them under an
 * "altPhone" prefix so both can sit in one form without clashing. */

export const PATIENT_ID_FIELD = "patientId";
export const PATIENT_NAME_FIELD = "name";
/** The number input of the patient's own phone; the same name PhoneField gives its number input. */
export const PATIENT_PHONE_FIELD = "phone";
export const ALT_PHONE_FIELD = "altPhone";
export const ALT_PHONE_COUNTRY_FIELD = "altPhoneCountry";
/** One text input holding every tag, separated by commas. */
export const PATIENT_TAGS_FIELD = "tags";

/** Merge: the record that stays, and the one folded into it. */
export const MERGE_KEEP_ID_FIELD = "keepId";
export const MERGE_REMOVE_ID_FIELD = "removeId";

/** Add booking. */
export const BOOKING_DATE_FIELD = "date";
export const BOOKING_START_FIELD = "start";
/** "any", or a doctor's id. */
export const BOOKING_DOCTOR_FIELD = "doctor";
/** "" for no particular service, or a service's id. */
export const BOOKING_SERVICE_FIELD = "serviceId";
/** The value of the doctor input that leaves the choice to the booking. */
export const ANY_DOCTOR = "any";
