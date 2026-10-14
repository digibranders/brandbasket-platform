/** The fields a client edits on their Listing tab, and the parsers for each small form there. */
import { textField, type FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";

export const LISTING_ABOUT_MAX_LENGTH = 160;
export const LISTING_TAGLINE_MAX_LENGTH = 80;
export const LISTING_TAG_LIMIT = 8;
export const LISTING_TAG_MAX_LENGTH = 32;

/**
 * The colours of the tagline card on the business's page (the website draws each; the names are what is stored). A
 * small fixed set, so every card stays readable and in the site's own palette.
 */
export const LISTING_TAGLINE_COLOURS = ["rose", "burgundy", "sand", "sage", "sky", "ink"] as const;
export type ListingTaglineColour = (typeof LISTING_TAGLINE_COLOURS)[number];
export const LISTING_TAGLINE_COLOUR_LABELS: Readonly<Record<ListingTaglineColour, string>> = {
  rose: "Rose",
  burgundy: "Burgundy",
  sand: "Sand",
  sage: "Sage",
  sky: "Sky",
  ink: "Ink",
};
/** Each colour's card and text (every pair is above 7:1). The website keeps its own copy of these, keyed by the same names. */
export const LISTING_TAGLINE_STYLES: Readonly<Record<ListingTaglineColour, { readonly background: string; readonly text: string }>> = {
  rose: { background: "#f7e7e5", text: "#6b1230" },
  burgundy: { background: "#6b1230", text: "#ffffff" },
  sand: { background: "#f1e6d3", text: "#4a3418" },
  sage: { background: "#e3ede3", text: "#1f4d33" },
  sky: { background: "#e1ecf5", text: "#17426b" },
  ink: { background: "#2a1a1f", text: "#ffffff" },
};
export const DEFAULT_TAGLINE_COLOUR: ListingTaglineColour = "rose";

export function isTaglineColour(value: string): value is ListingTaglineColour {
  return (LISTING_TAGLINE_COLOURS as readonly string[]).includes(value);
}

export const LISTING_BUTTONS = ["call", "whatsapp", "book", "directions", "website"] as const;
export type ListingButton = (typeof LISTING_BUTTONS)[number];
export type ListingButtonSwitches = Readonly<Record<ListingButton, boolean>>;

export const LISTING_BUTTON_LABELS: Readonly<Record<ListingButton, string>> = {
  call: "Call",
  whatsapp: "WhatsApp",
  book: "Book",
  directions: "Directions",
  website: "Website",
};

/**
 * Carriage return, line feed, and the Unicode line and paragraph separators. Written as escapes to keep the source
 * plain text.
 */
const HAS_LINE_BREAK = /[\r\n\u2028\u2029]/;

/**
 * Web addresses and email addresses. The TLD of the bare-domain pattern is lowercase only, so "B.Com" and "M.Com"
 * (degrees) pass; the slash pattern, also lowercase only, catches short links such as "bit.ly/abc".
 */
const ADDRESS_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[A-Za-z0-9-]{2,}\.(?:com|in|net|org|io|co|info|biz)\b/,
  /\b[a-z0-9-]+\.[a-z]{2,}\//,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
];

/** A run of digits with the separators people put in phone numbers. No ".", so times like 10.00 do not join up. */
const PHONE_RUN = /\+?\d[\d\s()-]{6,}\d/g;
/** A dash with a space each side, which is how a range ("500 - 1500") is written; phone numbers use bare dashes. */
const SPACED_DASH = /\s[-\u2013]\s/;
const PHONE_MIN_DIGITS = 8;
const RANGE_SIDE_MAX_DIGITS = 4;

function digitCount(text: string): number {
  return text.replace(/\D/g, "").length;
}

/** "1500-2500": two short numbers around one bare dash. A phone number's parts are longer or more than two. */
function isBareDashRange(part: string): boolean {
  const sides = part.trim().split("-");
  return sides.length === 2 && sides.every((side) => digitCount(side) <= RANGE_SIDE_MAX_DIGITS);
}

/** Ranges such as prices and years are set aside first, so only a real number reaches the digit count. */
function containsPhoneNumber(text: string): boolean {
  return (text.match(PHONE_RUN) ?? []).some((run) =>
    run
      .split(SPACED_DASH)
      .some((part) => digitCount(part) >= PHONE_MIN_DIGITS && !isBareDashRange(part)),
  );
}

const CONTACT_MESSAGE = "Web addresses, emails and phone numbers can't go here. Your buttons handle those.";

/** Web addresses, email addresses and phone numbers. Free text must not carry one past the checked buttons. */
export function containsContactDetails(text: string): boolean {
  return ADDRESS_PATTERNS.some((pattern) => pattern.test(text)) || containsPhoneNumber(text);
}

export function parseAboutForm(formData: FormData): FormParseResult<{ readonly about: string | null }> {
  const raw = textField(formData, "about");
  const about = cleanLine(raw);
  if (HAS_LINE_BREAK.test(raw) || about.length > LISTING_ABOUT_MAX_LENGTH) {
    return {
      success: false,
      field: "about",
      message: `Write it in one line, up to ${LISTING_ABOUT_MAX_LENGTH} characters.`,
    };
  }
  if (containsContactDetails(about)) return { success: false, field: "about", message: CONTACT_MESSAGE };
  return { success: true, data: { about: about === "" ? null : about } };
}

/** The tagline card: one line of the owner's own words and the colour it is drawn in. Empty text removes the card. */
export function parseTaglineForm(
  formData: FormData,
): FormParseResult<{ readonly tagline: string | null; readonly taglineColour: ListingTaglineColour }> {
  const raw = textField(formData, "tagline");
  const tagline = cleanLine(raw);
  if (HAS_LINE_BREAK.test(raw) || tagline.length > LISTING_TAGLINE_MAX_LENGTH) {
    return {
      success: false,
      field: "tagline",
      message: `Write it in one line, up to ${LISTING_TAGLINE_MAX_LENGTH} characters.`,
    };
  }
  if (containsContactDetails(tagline)) return { success: false, field: "tagline", message: CONTACT_MESSAGE };
  const colour = textField(formData, "colour");
  if (!isTaglineColour(colour)) return { success: false, field: "colour", message: "Choose one of the colours." };
  return { success: true, data: { tagline: tagline === "" ? null : tagline, taglineColour: colour } };
}

export function parseTagsForm(formData: FormData): FormParseResult<{ readonly tags: readonly string[] }> {
  const tags: string[] = [];
  for (const value of formData.getAll("tag")) {
    if (typeof value !== "string") continue;
    const tag = cleanLine(value);
    if (tag === "") continue;
    if (tag.length > LISTING_TAG_MAX_LENGTH) {
      return { success: false, field: "tag", message: `Keep each service to ${LISTING_TAG_MAX_LENGTH} characters.` };
    }
    if (containsContactDetails(tag)) return { success: false, field: "tag", message: CONTACT_MESSAGE };
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
  }
  if (tags.length > LISTING_TAG_LIMIT) {
    return { success: false, field: "tag", message: `Up to ${LISTING_TAG_LIMIT} services.` };
  }
  return { success: true, data: { tags } };
}

/** Each switch posts "on" when ticked and nothing when not, like any checkbox. */
export function parseButtonsForm(formData: FormData): FormParseResult<ListingButtonSwitches> {
  const switches = Object.fromEntries(
    LISTING_BUTTONS.map((button) => [button, textField(formData, button) === "on"]),
  ) as Record<ListingButton, boolean>;
  return { success: true, data: switches };
}

export function parseVisibleForm(formData: FormData): FormParseResult<{ readonly visible: boolean }> {
  const value = textField(formData, "visible");
  if (value !== "on" && value !== "off") {
    return { success: false, field: "visible", message: "Choose whether to show your listing." };
  }
  return { success: true, data: { visible: value === "on" } };
}
