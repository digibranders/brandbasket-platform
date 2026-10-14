import { BillingRangeError } from "./billing-range-error";
import { stateCodeOfGstCode } from "./gst-states";

/**
 * A GSTIN is 15 characters: state code (2 digits), PAN (10), entity number (1), "Z", check character. The check
 * character is the GSTN's mod-36 Luhn variant over the first 14. Pure and browser-safe, so the billing details form
 * can check a GSTIN as it is typed and the server checks it again before saving.
 */

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RADIX = ALPHABET.length;

/**
 * Thrown when a GSTIN is asked to name its state but is malformed or fails its check character. Never quotes the
 * GSTIN: the error reaches logs, and a customer's GSTIN does not belong there.
 */
export class InvalidGstinError extends Error {
  constructor() {
    super("Not a valid GSTIN");
    this.name = "InvalidGstinError";
  }
}

/** Strips spaces and upper-cases what a person typed, so a pasted GSTIN is judged on its characters alone. */
export function normaliseGstin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** The 15th character for the first 14. */
export function gstinCheckCharacter(first14: string): string {
  if (first14.length !== 14) throw new BillingRangeError(`Expected 14 characters, received ${first14.length}`);
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const value = ALPHABET.indexOf(first14.charAt(index));
    if (value < 0) throw new BillingRangeError("A GSTIN holds only digits and upper-case letters");
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / RADIX) + (product % RADIX);
  }
  return ALPHABET.charAt((RADIX - (sum % RADIX)) % RADIX);
}

/**
 * True for a well-formed GSTIN with the right check character, registered in an Indian state or union territory.
 * Expects input already passed through normaliseGstin: lower case or spaces make it false.
 */
export function isValidGstin(gstin: string): boolean {
  if (!GSTIN_PATTERN.test(gstin)) return false;
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin.charAt(14)) return false;
  return stateCodeOfGstCode(gstin.slice(0, 2)) !== null;
}

/** The platform state code ("mh") a valid GSTIN is registered in. */
export function stateCodeOfGstin(gstin: string): string {
  const state = isValidGstin(gstin) ? stateCodeOfGstCode(gstin.slice(0, 2)) : null;
  if (state === null) throw new InvalidGstinError();
  return state;
}
