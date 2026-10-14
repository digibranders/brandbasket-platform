/** A doctor's initials for the round avatar that stands in for a photo -- on the Doctors page, on each booking card
 * in the week grid, and on the website's doctor picker, so all three always agree. */
import { initialsOf } from "../names";

/** "Dr" or "Dr." as a whole first word, any case. "Drishti" does not match: the word must end right after it. */
const LEADING_TITLE = /^dr\.?\s+/i;

/**
 * "MI" for "Dr Meera Iyer": the first and last word's first letters, after dropping a leading "Dr"/"Dr." -- almost
 * every doctor's name starts with it, so keeping it would give half the clinic a "D". A name that is nothing but
 * the title keeps it rather than showing an empty circle; an empty name gives initialsOf's dash.
 */
export function practitionerInitials(name: string): string {
  const trimmed = name.trim();
  const withoutTitle = trimmed.replace(LEADING_TITLE, "");
  return initialsOf(withoutTitle === "" ? trimmed : withoutTitle);
}
