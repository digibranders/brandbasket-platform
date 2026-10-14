import "server-only";
import { getCountries, getCountryCallingCode, getExampleNumber, Metadata, type CountryCode } from "libphonenumber-js/max";
import mobileExamples from "libphonenumber-js/mobile/examples";
import type { PhoneDigitRange } from "../lib/forms/input-rules";
import type { PhoneCountryOption } from "../lib/phone/fields";
import { countryNameOf, localNumberOf } from "../lib/validation/phone";

/** Regional indicator symbol letter A. A flag is the pair of these matching the two letters of its code. */
const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = "A".charCodeAt(0);

/** The flag for a two-letter code, built from code points so the source holds no emoji. */
export function flagOf(country: string): string {
  const codePoints = Array.from(country, (letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A);
  return String.fromCodePoint(...codePoints);
}

function exampleFor(country: CountryCode): string | null {
  const example = getExampleNumber(country, mobileExamples);
  return example === undefined ? null : localNumberOf(example);
}

/** E.164's bounds, for the rare plan that lists no lengths. */
const ANY_LENGTH: PhoneDigitRange = { min: 4, max: 15 };

function digitsFor(country: CountryCode): PhoneDigitRange {
  const metadata = new Metadata();
  metadata.selectNumberingPlan(country);
  const lengths = metadata.numberingPlan?.possibleLengths() ?? [];
  return lengths.length === 0 ? ANY_LENGTH : { min: Math.min(...lengths), max: Math.max(...lengths) };
}

function optionFor(country: CountryCode): PhoneCountryOption {
  return {
    code: country,
    name: countryNameOf(country),
    dialCode: `+${getCountryCallingCode(country)}`,
    flag: flagOf(country),
    // Mobile examples: a business's public number and a lead's contact number are most often a mobile.
    example: exampleFor(country),
    digits: digitsFor(country),
  };
}

let cached: readonly PhoneCountryOption[] | undefined;

/**
 * Every country libphonenumber can validate, sorted by English name, for the phone field's select. Built once per
 * server process: the list only changes with the library.
 */
export function phoneCountryOptions(): readonly PhoneCountryOption[] {
  cached ??= getCountries()
    .map(optionFor)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cached;
}
