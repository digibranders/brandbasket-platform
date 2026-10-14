/** Parses the name and title a clinic gives one of its doctors (practitioners), for both the Doctors page's "Add a
 * doctor" form and each doctor's own edit form -- the two ask for exactly the same fields, so they share one
 * parser rather than each keeping its own copy of the limits. The limits match the practitioners table's CHECKs,
 * so a value this accepts is never refused by the database. Lengths count UTF-16 code units, the same as an HTML
 * input's `maxlength`. */
import type { FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";

export const PRACTITIONER_NAME_MAX_LENGTH = 80;
export const PRACTITIONER_TITLE_MAX_LENGTH = 80;

export interface PractitionerFields {
  readonly name: string;
  /** "Sports physiotherapist", or null when the clinic left it blank. */
  readonly title: string | null;
}

/** Both are single lines (`cleanLine` folds a pasted line break into a space): they sit on one line under the
 * doctor's photo on the website. The name is checked first, since it is the field a person fills in first. */
export function parsePractitionerFields(raw: { readonly name: string; readonly title: string }): FormParseResult<PractitionerFields> {
  const name = cleanLine(raw.name);
  if (name.length < 1) return { success: false, field: "name", message: "Enter the doctor's name." };
  if (name.length > PRACTITIONER_NAME_MAX_LENGTH) {
    return { success: false, field: "name", message: `Keep the name to ${String(PRACTITIONER_NAME_MAX_LENGTH)} characters.` };
  }

  const title = cleanLine(raw.title);
  if (title.length > PRACTITIONER_TITLE_MAX_LENGTH) {
    return { success: false, field: "title", message: `Keep the title to ${String(PRACTITIONER_TITLE_MAX_LENGTH)} characters.` };
  }

  return { success: true, data: { name, title: title === "" ? null : title } };
}
