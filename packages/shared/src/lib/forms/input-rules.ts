/**
 * What a field lets someone type, and what a finished value must look like, for the browser's side of a form.
 *
 * The server still validates every value with zod; these rules only stop impossible characters at the keyboard (a
 * letter in a phone number) and let the form tell, before it is sent, whether every field holds a value of the right
 * shape. Nothing here imports libphonenumber-js or zod, so it stays small enough for any client component.
 */

/** The filters a text field can apply as someone types or pastes. */
export type InputRule = "digits" | "phone" | "amount" | "personName" | "code";

const NOT_DIGIT = /[^0-9]/g;
/** Digits plus what people group a phone number with. The server's parser accepts the same set. */
const NOT_PHONE_CHARACTER = /[^0-9\s().+-]/g;
const NOT_AMOUNT_CHARACTER = /[^0-9.]/g;
/** Letters and combining marks in any script, so Devanagari or Tamil names are not cut apart. */
const NOT_NAME_CHARACTER = /[^\p{L}\p{M} .'-]/gu;
const NOT_CODE_CHARACTER = /[^A-Z0-9]/g;
const AMOUNT_PLACES = 2;

function keepLeadingPlus(value: string): string {
  const withoutPlus = value.replaceAll("+", "");
  return value.startsWith("+") ? `+${withoutPlus}` : withoutPlus;
}

function keepOneDecimalPoint(value: string): string {
  const point = value.indexOf(".");
  if (point === -1) return value;
  const whole = value.slice(0, point);
  const fraction = value.slice(point + 1).replaceAll(".", "").slice(0, AMOUNT_PLACES);
  return `${whole}.${fraction}`;
}

/** The value with every character the rule does not allow removed. */
export function applyInputRule(rule: InputRule, value: string): string {
  switch (rule) {
    case "digits":
      return value.replace(NOT_DIGIT, "");
    case "phone":
      return keepLeadingPlus(value.replace(NOT_PHONE_CHARACTER, ""));
    case "amount":
      return keepOneDecimalPoint(value.replace(NOT_AMOUNT_CHARACTER, ""));
    case "personName":
      return value.replace(NOT_NAME_CHARACTER, "");
    case "code":
      return value.toUpperCase().replace(NOT_CODE_CHARACTER, "");
  }
}

/** Where the caret belongs after filtering, so a refused character does not throw it to the end of the field. */
export function caretAfterRule(rule: InputRule, value: string, caret: number): number {
  return applyInputRule(rule, value.slice(0, caret)).length;
}

/**
 * HTML `pattern` values. The browser anchors a pattern and compiles it with the `v` flag, so a hyphen inside a class
 * is escaped. Each mirrors the server's rule for the same field.
 */
export const FIELD_PATTERNS = {
  /** packages/billing/src/gstin.ts */
  gstin: "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]",
  /** An Indian PIN code: six digits, never starting with zero. */
  pincode: "[1-9][0-9]{5}",
  /** A six-digit one-time code. */
  otp: "[0-9]{6}",
  /** Rupees, with up to two places of paise. */
  amount: "[0-9]+(?:\\.[0-9]{1,2})?",
  /** A founding year the directory can show. */
  year: "(?:18|19|20)[0-9]{2}",
} as const;

/** The shortest and longest national number a country dials, from libphonenumber's metadata on the server. */
export interface PhoneDigitRange {
  readonly min: number;
  readonly max: number;
}

/** E.164 caps a full number at 15 digits; fewer than 8 cannot be a country code plus a subscriber number. */
const INTERNATIONAL_DIGITS: PhoneDigitRange = { min: 8, max: 15 };

/**
 * Why a phone entry cannot be a number of the chosen country, or null when its length fits. Length only: the server
 * runs the full libphonenumber check. A number typed with + or 00 is international and checked against E.164 instead.
 */
export function phoneDigitsMessage(value: string, range: PhoneDigitRange): string | null {
  const entry = value.trim();
  if (entry === "") return null;

  if (entry.startsWith("+") || entry.startsWith("00")) {
    const digits = entry.replace(NOT_DIGIT, "").replace(/^00/, "").length;
    if (digits < INTERNATIONAL_DIGITS.min) return "Enter the full number after the country code.";
    return digits > INTERNATIONAL_DIGITS.max ? "That number has too many digits." : null;
  }

  const digits = entry.replace(NOT_DIGIT, "");
  // A national number may open with its trunk zero ("098765 43210"), which is not part of the subscriber number.
  const counted = digits.startsWith("0") ? digits.length - 1 : digits.length;
  if (counted >= range.min && counted <= range.max) return null;
  return range.min === range.max ? `Enter ${String(range.min)} digits.` : `Enter ${String(range.min)} to ${String(range.max)} digits.`;
}
