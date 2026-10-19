"use server";

import { clearNominee, saveNominee } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { PRIVACY_SETTINGS_PATH, type NomineeFormState } from "@/lib/privacy-settings-form";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { parseNomineeForm } from "@/lib/server/nominee";

/** Open to every kind of account, like the rest of Settings: a website client's, a free listing's, a member's. */
const ANY_ACCOUNT = { listingAccount: "allow", membershipCheckout: "allow" } as const;

/** Names the nominee, replacing any earlier one. The account is the session's, never the form's. */
export async function saveNomineeAction(_previous: NomineeFormState, formData: FormData): Promise<NomineeFormState> {
  const { user } = await requireCustomerAccess(ANY_ACCOUNT);
  const parsed = parseNomineeForm(formData, user.phone);
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field };
  await saveNominee(getAppDb(), user.id, { name: parsed.name, phone: parsed.phone });
  revalidatePath(PRIVACY_SETTINGS_PATH);
  return { status: "saved" };
}

/** Takes the nominee off the account. */
export async function clearNomineeAction(): Promise<NomineeFormState> {
  const { user } = await requireCustomerAccess(ANY_ACCOUNT);
  await clearNominee(getAppDb(), user.id);
  revalidatePath(PRIVACY_SETTINGS_PATH);
  return { status: "cleared" };
}
