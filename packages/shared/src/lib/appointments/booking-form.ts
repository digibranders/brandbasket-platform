/** The patient's fields as the client site forwards them for the Calendly-style slot booking flow, and the rules
 * that turn them into a clean booking. Replaces request-form.ts, which asked for a preferred date and window
 * instead of an exact slot. Every length limit below counts UTF-16 code units, the same as an HTML input's
 * `maxlength`.
 *
 * normalisePhone below delegates to validation/phone.ts's parsePhoneEntry, which is marked `"server-only"`. That
 * makes this module server-only too, transitively -- which is fine, because only the platform server ever imports
 * booking-form.ts (the client site posts plain form fields over HTTP; it never runs this parser itself). */
import { z } from "zod";
import { isIsoDate } from "../calendar/local-date";
import { EMAIL_FORMAT_MESSAGE, requiredEmail } from "../validation/contact";
import { parsePhoneEntry } from "../validation/phone";
import { cleanLine } from "../validation/text";

/** Caps every raw string at 2000 characters so a huge body is rejected before any field-level rule runs. */
const RAW_MAX_LENGTH = 2000;
const rawString = z.string().max(RAW_MAX_LENGTH);

/** The booking asks for no note. z.object drops unknown keys, so a client site built before it was removed can still
 * post one: it is discarded here rather than rejected, and never reaches the database. */
export const bookingFieldsSchema = z.object({
  name: rawString,
  /** The address the confirmation code is emailed to. Optional in the shape so a client site built before the code moved
   * to email gets a 422 that names the field, not an unexplained 400. */
  email: rawString.nullish(),
  /** A number the clinic can call. Collected, never verified: nothing is sent to it. */
  phone: rawString,
  serviceId: rawString.nullish(),
  date: rawString,
  start: rawString,
  website: rawString.nullish(),
  /** The doctor the patient picked; null or missing means any doctor. Optional so a client site built before a
   * clinic could have more than one doctor keeps posting a valid body. */
  practitionerId: rawString.nullish(),
  /** Which version of the patient notice the page showed (lib/privacy/patient-notice.ts), kept as proof of the notice the
   * patient saw. Optional so a client site built before it existed keeps posting a valid body. */
  noticeVersion: z.string().max(40).nullish(),
});

export type BookingFields = z.infer<typeof bookingFieldsSchema>;

export const NAME_MAX_LENGTH = 80;

export interface BookingInput {
  readonly name: string;
  /** Trimmed and lowercased: the address the confirmation code is emailed to. */
  readonly email: string;
  /** E.164, e.g. "+919876543210": how the clinic reaches the patient. Never verified: nothing is sent to it. */
  readonly phone: string;
  readonly serviceId: string | null;
  readonly date: string; // YYYY-MM-DD
  readonly start: string; // HH:MM
  /** A uuid-shaped id the patient picked, or null for any doctor. Only its shape is checked here: whether it names
   * an active doctor of this clinic is a database question, answered by requestBookingOtp. */
  readonly practitionerId: string | null;
  /** The patient notice version the page showed; present only when the client site sent one. */
  readonly noticeVersion?: string;
}

export type BookingParseResult =
  | { readonly success: true; readonly data: BookingInput }
  | { readonly success: false; readonly field: keyof BookingFields; readonly message: string };

const uuidFormat = z.uuid();
const EMAIL_MISSING_MESSAGE = "Enter your email address.";
const PHONE_MESSAGE = "Enter a phone number the clinic can call, like +91 98765 43210.";
const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00-23:59, the range findSlot can ever match

export function parseBookingFields(fields: BookingFields): BookingParseResult {
  const name = cleanLine(fields.name);
  if (name.length < 1) {
    return { success: false, field: "name", message: "Enter your name." };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { success: false, field: "name", message: `Keep your name to ${NAME_MAX_LENGTH} characters.` };
  }

  const email = requiredEmail(EMAIL_MISSING_MESSAGE).safeParse(fields.email ?? "");
  if (!email.success) {
    return { success: false, field: "email", message: email.error.issues[0]?.message ?? EMAIL_FORMAT_MESSAGE };
  }

  const phone = normalisePhone(fields.phone);
  if (phone === null) {
    return { success: false, field: "phone", message: PHONE_MESSAGE };
  }

  const rawServiceId = (fields.serviceId ?? "").trim();
  let serviceId: string | null = null;
  if (rawServiceId !== "") {
    if (!uuidFormat.safeParse(rawServiceId).success) {
      return { success: false, field: "serviceId", message: "Choose a service from the list." };
    }
    serviceId = rawServiceId;
  }

  const date = fields.date.trim();
  if (!isIsoDate(date)) {
    return { success: false, field: "date", message: "Choose a date." };
  }

  const start = fields.start.trim();
  if (!START_TIME.test(start)) {
    return { success: false, field: "start", message: "Choose a time." };
  }

  const rawPractitionerId = (fields.practitionerId ?? "").trim();
  let practitionerId: string | null = null;
  if (rawPractitionerId !== "") {
    if (!uuidFormat.safeParse(rawPractitionerId).success) {
      return { success: false, field: "practitionerId", message: "Choose a doctor from the list." };
    }
    practitionerId = rawPractitionerId;
  }

  const noticeVersion = (fields.noticeVersion ?? "").trim();
  return { success: true, data: { name, email: email.data, phone, serviceId, date, start, practitionerId, ...(noticeVersion === "" ? {} : { noticeVersion }) } };
}

/**
 * Country-calling-code -> ISO 3166-1 alpha-2 region, for the default country codes this app is actually configured
 * with. parsePhoneEntry needs a region to interpret a number with no country code of its own, and a bare calling
 * code isn't enough by itself to pick one (several regions can share a calling code, e.g. "1" for both the US and
 * Canada), so this only maps the ones in real use rather than trying to be an exhaustive reverse lookup.
 */
const COUNTRY_CALLING_CODE_TO_REGION: Readonly<Record<string, string>> = {
  "91": "IN",
  "1": "US",
  "44": "GB",
};

/**
 * Turns what a patient typed into an E.164 number (`^\+[0-9]{8,15}$`, which can never start with a "0"), or null
 * when it can't be. Delegates to validation/phone.ts's parsePhoneEntry -- the same libphonenumber-js-backed parser
 * every other phone field in this app uses -- rather than re-implementing digit-counting rules by hand: real phone
 * numbering plans already know things a handwritten rule would get wrong, e.g. that a bare 10-digit Indian number
 * starting with "0" isn't a real mobile number, while a leading "0" *plus* a real 10-digit number is that same
 * number's domestic trunk-prefixed form.
 *
 * A number starting with "+" or "00" (international dialling) is read as-is, ignoring `defaultCountryCode`
 * entirely. Otherwise it's read as a national number for whichever region `defaultCountryCode` (no leading "+")
 * maps to in COUNTRY_CALLING_CODE_TO_REGION above -- "91" for most of this app's patients, who are dialling from
 * India. An unrecognised calling code returns null: there's no region to interpret the number against.
 */
export function normalisePhone(raw: string, defaultCountryCode = "91"): string | null {
  const region = COUNTRY_CALLING_CODE_TO_REGION[defaultCountryCode];
  if (region === undefined) return null;
  const result = parsePhoneEntry({ country: region, number: raw }, null);
  return result.success ? result.e164 : null;
}

/** True once the hidden field is filled, which only a script does. */
export function isBookingHoneypotFilled(fields: BookingFields): boolean {
  return (fields.website ?? "").trim() !== "";
}

/** "+919876543210" becomes "•••• 3210": the last 4 digits, for the OTP screen to confirm without repeating the
 * whole number. */
export function phoneHint(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}
