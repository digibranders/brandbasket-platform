import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export interface DisplayPhone {
  /** For reading, e.g. "+91 98765 43210". */
  readonly text: string;
  /** For a tel: link, e.g. "+919876543210", or null when there is nothing to dial. */
  readonly href: string | null;
}

const NOT_DIALLABLE = /[^\d+]/g;

/**
 * A stored phone number, laid out for people. Numbers are stored as E.164; older rows keep whatever was typed, and
 * those are shown as they are when they cannot be read.
 */
export function displayPhone(stored: string): DisplayPhone {
  const phone = parsePhoneNumberFromString(stored.trim(), { extract: false });
  if (phone !== undefined) return { text: phone.formatInternational(), href: `tel:${phone.number}` };
  const dialable = stored.replace(NOT_DIALLABLE, "");
  return { text: stored, href: /\d/.test(dialable) ? `tel:${dialable}` : null };
}

/** The readable form of an optional stored number. */
export function displayPhoneText(stored: string | null): string | null {
  return stored === null || stored.trim() === "" ? stored : displayPhone(stored).text;
}

/** How many digits at the end of a masked number stay readable: enough to tell two accounts apart, too few to dial. */
const MASKED_PHONE_VISIBLE_DIGITS = 3;

/**
 * A stored number with all but its country code and last three digits hidden, e.g. "+91 ••••• ••210", for lists where
 * staff have no reason to call the person. Anything that cannot be read as a number is hidden entirely.
 */
export function maskPhone(stored: string): string {
  const phone = parsePhoneNumberFromString(stored.trim(), { extract: false });
  if (phone === undefined) return "••••••••••";
  const national = phone.nationalNumber;
  const hidden = "•".repeat(Math.max(0, national.length - MASKED_PHONE_VISIBLE_DIGITS));
  return `+${phone.countryCallingCode} ${hidden} ${national.slice(-MASKED_PHONE_VISIBLE_DIGITS)}`;
}
