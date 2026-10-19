/*
 * The Details tab's limits and form state (docs/superpowers/specs/2026-10-01-business-profile-design.md), browser-safe
 * so the form component shares them. The parser is lib/business-details-form.ts, server only (the phone rules load
 * libphonenumber's full metadata).
 */

/** The most words "About the business" takes: the limit the owner sees and the parser enforces. */
export const BUSINESS_ABOUT_MAX_WORDS = 250;

/**
 * The longest "About the business" text in characters, a ceiling above any 250 words; the database holds the same
 * (BUSINESS_ABOUT_MAX_LENGTH in @brandbasket/db). The word limit is the real one.
 */
export const BUSINESS_ABOUT_MAX_LENGTH = 4000;

/** How many words a text holds: runs of non-space characters. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

/** The first `maxWords` words of a text, its line breaks kept; shorter text comes back as it is. */
export function limitWords(text: string, maxWords: number): string {
  let seen = 0;
  for (const match of text.matchAll(/\S+/gu)) {
    seen += 1;
    if (seen === maxWords) return text.slice(0, match.index + match[0].length);
  }
  return text;
}

/** The value the "Same as phone" box posts when it is ticked. */
export const WHATSAPP_SAME_VALUE = "same";

export const BUSINESS_DETAILS_FIELDS = [
  "businessName",
  "address",
  "phone",
  "whatsappSame",
  "whatsapp",
  "maps",
  "directionsNote",
  "website",
  "email",
  "gstNumber",
  "instagram",
  "facebook",
  "linkedin",
  "about",
  "establishedYear",
  "serviceArea",
  "holidayHours",
  "open24x7",
] as const;
export type BusinessDetailsField = (typeof BUSINESS_DETAILS_FIELDS)[number];

/** The form keeps its own values (they are controlled), so a refusal carries only what went wrong and where. */
export type BusinessDetailsFormState =
  | { readonly status: "idle" }
  /** `field` names the box to mark: one of BUSINESS_DETAILS_FIELDS, an hours field like "hours.2.opens", or null. */
  | { readonly status: "error"; readonly field: string | null; readonly message: string };

export const initialBusinessDetailsFormState: BusinessDetailsFormState = { status: "idle" };
