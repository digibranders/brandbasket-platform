"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSetupCallUrl, SETUP_CALL_URL_FIELD } from "@fynix/shared/lib/setup-call-link";
import { settingsNoticeHref } from "@/lib/settings-notices";
import { saveSetupCallUrl } from "@/lib/server/settings-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";

/**
 * Saves the link customers follow to book a setup call, or clears it when the box is left empty. The address is read and
 * checked here, whatever the form allowed: only a secure web address is kept. Any staff member may change it.
 */
export async function saveSetupCallUrlAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const typed = formData.get(SETUP_CALL_URL_FIELD);
  const reading = readSetupCallUrl(typeof typed === "string" ? typed : "");
  if (!reading.ok) redirect(settingsNoticeHref(reading.problem));
  await saveSetupCallUrl({ url: reading.url, staffUserId: user.id }, new Date());
  revalidatePath("/settings");
  redirect(settingsNoticeHref(reading.url === null ? "setup-call-cleared" : "setup-call-saved"));
}
