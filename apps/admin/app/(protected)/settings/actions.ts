"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readSetupCallUrl, SETUP_CALL_URL_FIELD } from "@brandbasket/shared/lib/setup-call-link";
import { isTeamsDestination, readTeamsWebhookUrl, TEAMS_DESTINATION_FIELD, TEAMS_URL_FIELD, type TeamsDestination } from "@brandbasket/shared/lib/teams-webhook";
import { settingsNoticeHref } from "@/lib/settings-notices";
import { saveSetupCallUrl } from "@/lib/server/settings-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { requireStaffCan } from "@/lib/server/staff-role";
import { removeTeamsUrl, saveTeamsUrl, testTeamsUrl } from "@/lib/server/teams-admin";

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

/** Reads which channel a Teams form is for. Anything but a real destination is refused, whatever the form posted. */
function readDestination(formData: FormData): TeamsDestination {
  const destination = formData.get(TEAMS_DESTINATION_FIELD);
  if (!isTeamsDestination(destination)) redirect("/settings");
  return destination;
}

/** Saves the Teams webhook address for one kind of alert. Admins only: the address lets anyone who holds it post to the channel. */
export async function saveTeamsWebhookAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("integrations");
  const destination = readDestination(formData);
  const typed = formData.get(TEAMS_URL_FIELD);
  const reading = readTeamsWebhookUrl(typeof typed === "string" ? typed : "");
  if (!reading.ok) redirect(settingsNoticeHref(reading.problem));
  if (reading.url === null) redirect(settingsNoticeHref("teams-nothing-pasted"));
  await saveTeamsUrl({ destination, url: reading.url, staffUserId: user.id }, new Date());
  revalidatePath("/settings");
  redirect(settingsNoticeHref("teams-saved"));
}

export async function removeTeamsWebhookAction(formData: FormData): Promise<void> {
  await requireStaffCan("integrations");
  await removeTeamsUrl(readDestination(formData));
  revalidatePath("/settings");
  redirect(settingsNoticeHref("teams-removed"));
}

/** Posts a test card to the saved address and says what happened. */
export async function testTeamsWebhookAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("integrations");
  const result = await testTeamsUrl(readDestination(formData), { email: user.email }, new Date());
  redirect(settingsNoticeHref(`teams-test-${result === "sent" ? "sent" : result}`));
}
