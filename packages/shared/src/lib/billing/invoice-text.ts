/** Printable ASCII: every character Hanken Grotesk can draw on the invoice and every billing-details field accepts. */
export function isPrintableOnInvoice(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}

// Typographic punctuation that phone keyboards and our own app copy produce, mapped to the plain character that says
// the same thing. Letters of other scripts are deliberately absent: they are real content, not punctuation.
const SEPARATOR_DOTS = /\s*[\u00B7\u2022\u2027]\s*/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201B\u2032]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201F\u2033]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
const ELLIPSIS = /\u2026/g;
const UNICODE_SPACES = /[\u00A0\u2002-\u200A\u202F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/**
 * The text as the invoice will print it: typographic punctuation turned into the plain ASCII it stands for, so "Upgrade
 * to Premium \u00B7 31 days left" prints as "Upgrade to Premium, 31 days left" and "Rao\u2019s Dental" as "Rao's Dental".
 * Nothing else changes, so a name in Devanagari or an accented letter still fails isPrintableOnInvoice and holds the
 * invoice (D12). Runs of spaces collapse to one and the ends are trimmed.
 */
export function normaliseInvoiceText(text: string): string {
  return text
    .replace(ZERO_WIDTH, "")
    .replace(SEPARATOR_DOTS, ", ")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(ELLIPSIS, "...")
    .replace(UNICODE_SPACES, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}
