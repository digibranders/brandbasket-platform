/**
 * What the browser needs to know about phone inputs. Nothing here imports libphonenumber-js: its metadata is large,
 * so parsing, validation and the country list are built on the server and handed to the phone field as props.
 */

import type { PhoneDigitRange } from "../forms/input-rules";

/** The select that holds the ISO 3166-1 alpha-2 code the number is dialled from, e.g. "IN". */
export const PHONE_COUNTRY_FIELD = "phoneCountry";

/** Used when there is no better guess: most customers are in India. */
export const FALLBACK_PHONE_COUNTRY = "IN";

/** Longer than any real number with its spacing, short enough that a paste cannot be huge. */
export const MAX_PHONE_LENGTH = 40;

/** One entry in the country select, computed on the server. */
export interface PhoneCountryOption {
  /** ISO 3166-1 alpha-2, e.g. "GB". */
  readonly code: string;
  /** English name, e.g. "United Kingdom". */
  readonly name: string;
  /** With its plus, e.g. "+44". */
  readonly dialCode: string;
  /** Regional indicator pair for the code. */
  readonly flag: string;
  /** A national number in the country's usual layout, for the placeholder, when libphonenumber has one. */
  readonly example: string | null;
  /** How many digits a national number of this country can have, so the browser can catch a short entry early. */
  readonly digits: PhoneDigitRange;
}
