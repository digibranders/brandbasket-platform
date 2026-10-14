import "server-only";
import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/max";
import { z } from "zod";
import { MAX_PHONE_LENGTH, PHONE_COUNTRY_FIELD } from "../phone/fields";
import { cleanLine } from "./text";

export const CHOOSE_COUNTRY_MESSAGE = "Choose your country code.";
export const INTERNATIONAL_PHONE_MESSAGE = "Enter a valid phone number, including the country code.";
export const PHONE_TOO_LONG_MESSAGE = "That phone number is too long.";

/** Digits, optionally opening with a plus or a bracketed area code; spaces, dots and dashes group them. */
const PHONE_SHAPE = /^\+?\(?[0-9][0-9\s().-]*$/;
/** Checked before asking libphonenumber, whose metadata lookup would also accept inherited keys like "constructor". */
const COUNTRY_CODE_SHAPE = /^[A-Z]{2}$/;
/** The international call prefix most of the world dials before a country code. */
const INTERNATIONAL_PREFIX = "00";

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** A supported, well-formed country code, or null for anything else a request might carry. */
export function supportedCountryOf(value: string): CountryCode | null {
  return COUNTRY_CODE_SHAPE.test(value) && isSupportedCountry(value) ? value : null;
}

/** The English name of a country, e.g. "India" for "IN"; the code itself when there is no name for it. */
export function countryNameOf(country: CountryCode): string {
  return REGION_NAMES.of(country) ?? country;
}

export function nationalPhoneMessage(country: CountryCode): string {
  return `Enter a valid phone number for ${countryNameOf(country)}.`;
}

/** What the form sends: the chosen country and the number as typed. */
export interface PhoneEntry {
  readonly country: string;
  readonly number: string;
}

/** Which of the two inputs a problem is about. */
export type PhoneEntryPart = "country" | "number";

export type PhoneParseResult =
  | { readonly success: true; readonly e164: string | null }
  | { readonly success: false; readonly part: PhoneEntryPart; readonly message: string };

function refused(part: PhoneEntryPart, message: string): PhoneParseResult {
  return { success: false, part, message };
}

/** Parses the whole text as one number and returns it as E.164, or refuses it with `message`. */
function toE164(text: string, defaultCountry: CountryCode | undefined, message: string): PhoneParseResult {
  if (!PHONE_SHAPE.test(text)) return refused("number", message);
  const phone = parsePhoneNumberFromString(text, { defaultCountry, extract: false });
  // E.164 has no room for an extension, so one is refused rather than silently dropped.
  if (phone === undefined || phone.ext !== undefined || !phone.isValid()) return refused("number", message);
  return { success: true, e164: phone.number };
}

/**
 * A number that starts with + or 00 is read as international and the country is ignored. Anything else is read as a
 * national number for the chosen country, which must be one libphonenumber supports. A blank number is null when
 * `missingMessage` is null, and refused with it otherwise.
 */
export function parsePhoneEntry(entry: PhoneEntry, missingMessage: string | null): PhoneParseResult {
  const number = cleanLine(entry.number);
  if (number === "") {
    return missingMessage === null ? { success: true, e164: null } : refused("number", missingMessage);
  }
  if (number.length > MAX_PHONE_LENGTH) return refused("number", PHONE_TOO_LONG_MESSAGE);

  if (number.startsWith("+")) return toE164(number, undefined, INTERNATIONAL_PHONE_MESSAGE);
  if (number.startsWith(INTERNATIONAL_PREFIX)) {
    return toE164(`+${number.slice(INTERNATIONAL_PREFIX.length)}`, undefined, INTERNATIONAL_PHONE_MESSAGE);
  }

  const country = supportedCountryOf(cleanLine(entry.country));
  if (country === null) return refused("country", CHOOSE_COUNTRY_MESSAGE);
  return toE164(number, country, nationalPhoneMessage(country));
}

const phoneEntrySchema = z.object({ country: z.string(), number: z.string() });

/** Rejects the entry with the problem's message, on the path of the input it is about. */
function phoneSchema(missingMessage: string | null) {
  return phoneEntrySchema.transform((entry, context) => {
    const result = parsePhoneEntry(entry, missingMessage);
    if (result.success) return result.e164;
    context.issues.push({ code: "custom", input: entry, path: [result.part], message: result.message });
    return z.NEVER;
  });
}

/** For a `{ country, number }` value in a form schema; always a valid E.164 number. */
export function requiredPhone(missingMessage: string) {
  return phoneSchema(missingMessage).pipe(z.string());
}

/** For a `{ country, number }` value in a form schema; a blank number becomes null and needs no country. */
export const optionalPhone = phoneSchema(null);

/** The form field an issue inside a phone value belongs to, from the part of its path below that value. */
export function phoneFormField(part: PropertyKey | undefined): "phone" | typeof PHONE_COUNTRY_FIELD {
  return part === "country" ? PHONE_COUNTRY_FIELD : "phone";
}

/** Countries whose numbers are usually written without the national trunk prefix, even though dialling allows it. */
const WRITTEN_WITHOUT_TRUNK_PREFIX: ReadonlySet<string> = new Set(["IN"]);

/**
 * The number as someone types it beside a country select: the country's usual national layout, except where people
 * leave out the trunk prefix (India's "098765 43210" is written "98765 43210"; the UK keeps "020 7946 0958").
 */
export function localNumberOf(phone: PhoneNumber): string {
  if (phone.country === undefined || !WRITTEN_WITHOUT_TRUNK_PREFIX.has(phone.country)) return phone.formatNational();
  const prefix = `+${phone.countryCallingCode} `;
  const international = phone.formatInternational();
  return international.startsWith(prefix) ? international.slice(prefix.length) : phone.nationalNumber;
}
