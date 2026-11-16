/*
 * The posts we write never carry an em dash. The posting service cleans new words as it writes them; this cleans the topics written before that,
 * so every screen reads the same. A dash between numbers becomes a hyphen, one between words a comma, one that ends a sentence a full stop.
 * Hyphens are never touched, and words the customer typed herself are left as she wrote them (see `plainWords`).
 */

const DASH = "[\\u2014\\u2013\\u2015]";
const BETWEEN_NUMBERS = new RegExp(`(\\d)\\s*${DASH}\\s*(\\d)`, "g");
const BEFORE_STOP = new RegExp(`\\s*${DASH}+(?=[.!?])`, "g");
const AT_END = new RegExp(`\\s*${DASH}+\\s*(?=$|\\n)`, "g");
const BETWEEN_WORDS = new RegExp(`\\s*${DASH}+\\s*`, "g");

/** `text` without em dashes, en dashes or horizontal bars. */
export function withoutDashes(text: string): string {
  if (!new RegExp(DASH).test(text)) return text;
  return text
    .replace(BETWEEN_NUMBERS, "$1-$2")
    .replace(BEFORE_STOP, "")
    .replace(AT_END, ".")
    .replace(BETWEEN_WORDS, ", ")
    .replace(/^,\s*/, "")
    .replace(/,\s*,/g, ",");
}

/** The words of a post: left alone when the customer wrote or edited them, cleaned otherwise. */
export const plainWords = (text: string, edited: boolean): string => (edited ? text : withoutDashes(text));
