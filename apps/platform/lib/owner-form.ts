import { z } from "zod";

/*
 * The boundary of the free listing account's own forms (the Business page). A form posts only the fields it shows, so
 * anything else is refused before a field is read: above all a web address (`urlSlug`, `citySlug`, `slug`), which an
 * owner can never set. A business's URL is made from what staff confirmed and frozen once its page is live (Task 8 of
 * docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). Browser-safe.
 *
 * React adds its own `$ACTION_…` inputs to a form whose action is a server action. They are removed before the action
 * sees a form posted without JavaScript (decodeAction), but a form sent from the browser by React (useActionState)
 * arrives with them, so they are left out here: they name the action, never a field the owner could set.
 */

/** React's own fields for a server action: `$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_KEY` and the like. */
const REACT_ACTION_PREFIX = "$ACTION_";

export const OWNER_FORM_FIELDS_MESSAGE = "This form only takes the details it shows. Reload the page and try again.";

/** Checks a posted form against the fields one owner form shows; each is text, and none is required here. */
export type OwnerFormCheck = (formData: FormData) => boolean;

export function ownerFormCheck(fields: readonly string[]): OwnerFormCheck {
  const schema = z.strictObject(Object.fromEntries(fields.map((field) => [field, z.string().optional()])));
  return (formData) =>
    schema.safeParse(Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith(REACT_ACTION_PREFIX)))).success;
}
