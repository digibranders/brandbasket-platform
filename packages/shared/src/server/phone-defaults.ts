import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { FALLBACK_PHONE_COUNTRY } from "../lib/phone/fields";
import { localNumberOf, supportedCountryOf } from "../lib/validation/phone";

/** Set by Vercel's edge from the visitor's IP address. Absent elsewhere, and only as good as the IP lookup. */
export const VISITOR_COUNTRY_HEADER = "x-vercel-ip-country";

/** The visitor's country from Vercel's header when it names a supported country, otherwise India. */
export function visitorPhoneCountry(headers: Pick<Headers, "get">): string {
  const value = headers.get(VISITOR_COUNTRY_HEADER)?.trim() ?? "";
  return supportedCountryOf(value) ?? FALLBACK_PHONE_COUNTRY;
}

/** What the phone field starts with for a number that is already saved. */
export interface PhoneFieldStart {
  /** The saved number's country, or null when it has none (a non-geographic number, or one that does not parse). */
  readonly country: string | null;
  /** The number as the customer would type it for that country, or the saved text when it cannot be read. */
  readonly number: string;
}

/**
 * Splits a saved number into the select and the input. An E.164 number shows as it is typed locally beside its
 * country; anything else is shown as saved, and a leading + keeps it valid whatever country is chosen.
 */
export function savedPhoneStart(saved: string | null): PhoneFieldStart {
  if (saved === null || saved.trim() === "") return { country: null, number: "" };
  const phone = parsePhoneNumberFromString(saved, { extract: false });
  const country = phone?.country === undefined ? null : supportedCountryOf(phone.country);
  if (phone === undefined || country === null) return { country: null, number: saved };
  return { country, number: localNumberOf(phone) };
}
