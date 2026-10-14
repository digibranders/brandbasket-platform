import "server-only";
import { cleanLine } from "@firstfold/shared/lib/validation/text";
import { parsePhoneEntry } from "@firstfold/shared/lib/validation/phone";
import { NOMINEE_NAME_MAX_LENGTH, type NomineeFormField } from "@/lib/privacy-settings-form";

/** Numbers typed without a country code are Indian: Firstfold's people are. A number with +CC keeps its own country. */
const DEFAULT_PHONE_COUNTRY = "IN";

const NAME_MISSING_MESSAGE = "Enter the name of the person you are naming.";
const NAME_TOO_LONG_MESSAGE = `Keep the name to ${NOMINEE_NAME_MAX_LENGTH} characters.`;
const PHONE_MISSING_MESSAGE = "Enter their mobile number.";
const OWN_NUMBER_MESSAGE = "Name someone else: a nominee acts for you when you cannot, so it cannot be your own number.";

export type NomineeParse =
  | { readonly success: true; readonly name: string; readonly phone: string }
  | { readonly success: false; readonly field: NomineeFormField; readonly message: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The nominee a form names, cleaned and checked: a name, and a mobile number as E.164 (Firstfold holds no email addresses,
 * so a number is the only way to reach them). `ownPhone` is the account's own number, which cannot also be the nominee's.
 */
export function parseNomineeForm(formData: FormData, ownPhone: string | null): NomineeParse {
  const name = cleanLine(text(formData, "name")).replace(/\s+/g, " ");
  if (name === "") return { success: false, field: "name", message: NAME_MISSING_MESSAGE };
  if (Array.from(name).length > NOMINEE_NAME_MAX_LENGTH) return { success: false, field: "name", message: NAME_TOO_LONG_MESSAGE };

  const phone = parsePhoneEntry({ country: DEFAULT_PHONE_COUNTRY, number: text(formData, "phone") }, PHONE_MISSING_MESSAGE);
  if (!phone.success) return { success: false, field: "phone", message: phone.message };
  if (phone.e164 === null) return { success: false, field: "phone", message: PHONE_MISSING_MESSAGE };
  if (ownPhone !== null && phone.e164 === ownPhone) return { success: false, field: "phone", message: OWN_NUMBER_MESSAGE };
  return { success: true, name, phone: phone.e164 };
}
