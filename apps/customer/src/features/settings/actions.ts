"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { clearNominee, NOTIFICATION_TOPICS, saveNominee, setNotificationPreference, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { parseForm } from "@/lib/form";
import { requireCustomer, requireOwner } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { ACCOUNT_CLOSED_NOTICE, changePasswordSchema, deleteAccountSchema, profileSchema } from "./rules/account-settings-form";
import { parseNomineeForm } from "./rules/nominee";
import { closeAccountFor } from "./server/account-exit";
import { changePasswordFor, revokeOtherSessionsFor } from "./server/account-security";

const PROFILE_PATH = "/settings";
const PRIVACY_PATH = "/settings/privacy";

const TOO_MANY_TRIES = "Too many tries. Please wait a while and try again.";
const WRONG_CURRENT_PASSWORD = "That isn’t your current password.";
const REVOKE_FAILED = "Your other devices could not be signed out. Please try again.";
const SAVE_FAILED = "We could not save that. Try again in a moment.";

/*
 * Settings is open to every member of a business, whatever its billing (an unpaid customer still changes a password), so these
 * ask for requireCustomer. Deleting the account ends the business's plan, so it asks for the owner. The account is always the
 * session's: nothing a form carries (a user id, a business id) is read.
 */

/** Saves the name shown on the dashboard and in emails. The email and the mobile number are how the person signs in and stay as they are. */
export async function saveProfileAction(formData: FormData): Promise<ActionResult> {
  await requireCustomer();
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.ok) return parsed;
  try {
    await getAuth().api.updateUser({ body: { name: parsed.data.name }, headers: await headers() });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.profile.save" });
    return actionFail(SAVE_FAILED);
  }
  revalidatePath(PROFILE_PATH);
  return actionOk();
}

/** What a password change tells the form: the other devices are signed out, or the password changed but signing them out failed. */
export interface PasswordChanged {
  readonly otherDevicesSignedOut: boolean;
}

/** Changes the signed-in account's password. The current one must be right; every other device is signed out with it. */
export async function changePasswordAction(formData: FormData): Promise<ActionResult<PasswordChanged>> {
  const { user } = await requireCustomer();
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.ok) return parsed;
  let outcome: Awaited<ReturnType<typeof changePasswordFor>>;
  try {
    outcome = await changePasswordFor(user.id, { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.password.change" });
    return actionFail(SAVE_FAILED);
  }
  if (outcome === "wrong-password") return actionFail(WRONG_CURRENT_PASSWORD, { currentPassword: WRONG_CURRENT_PASSWORD });
  if (outcome === "limited") return actionFail(TOO_MANY_TRIES);
  return actionOk({ otherDevicesSignedOut: outcome === "changed" });
}

/** Signs out every device but this one. Also the retry after a password change whose sign-out failed. Takes no input. */
export async function revokeOtherSessionsAction(): Promise<ActionResult> {
  const { user } = await requireCustomer();
  const outcome = await revokeOtherSessionsFor(user.id);
  if (outcome === "limited") return actionFail(TOO_MANY_TRIES);
  if (outcome === "failed") return actionFail(REVOKE_FAILED);
  return actionOk();
}

const notificationSchema = z.object({ topic: z.enum(NOTIFICATION_TOPICS), email: z.boolean() });

/** Stores one email choice of the signed-in person, for their business. Applies at once, as the switch does. */
export async function setNotificationAction(topic: string, email: boolean): Promise<ActionResult> {
  const customer = await requireCustomer();
  const parsed = notificationSchema.safeParse({ topic, email });
  if (!parsed.success) return actionFail("That setting does not exist.");
  try {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => setNotificationPreference(tx, customer.user.id, parsed.data.topic, parsed.data.email));
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.notifications.set" });
    return actionFail(SAVE_FAILED);
  }
  return actionOk();
}

/** Names the nominee, replacing any earlier one. The account is the session's, never the form's. */
export async function saveNomineeAction(formData: FormData): Promise<ActionResult> {
  const { user } = await requireCustomer();
  const parsed = parseNomineeForm(formData, user.phone);
  if (!parsed.success) return actionFail(parsed.message, { [parsed.field]: parsed.message });
  try {
    await saveNominee(getAppDb(), user.id, { name: parsed.name, phone: parsed.phone });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.nominee.save" });
    return actionFail(SAVE_FAILED);
  }
  revalidatePath(PRIVACY_PATH);
  return actionOk();
}

/** Takes the nominee off the account. Takes no input. */
export async function clearNomineeAction(): Promise<ActionResult> {
  const { user } = await requireCustomer();
  try {
    await clearNominee(getAppDb(), user.id);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.nominee.clear" });
    return actionFail(SAVE_FAILED);
  }
  revalidatePath(PRIVACY_PATH);
  return actionOk();
}

/**
 * The last step: closes the account. Everything that matters is checked here, not in the browser: the word typed, the
 * password, and what the plan is. On success every device is signed out and the person lands on the sign-in page. Only the
 * owner may close it, because closing ends the whole business's plan.
 */
export async function deleteAccountAction(formData: FormData): Promise<ActionResult> {
  const customer = await requireOwner();
  const parsed = parseForm(deleteAccountSchema, formData);
  if (!parsed.ok) return parsed;
  const { password, ...details } = parsed.data;
  let outcome: Awaited<ReturnType<typeof closeAccountFor>>;
  try {
    outcome = await closeAccountFor(customer, { reason: details.reason, comment: details.comment, password }, new Date());
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.delete" });
    return actionFail("We could not close your account just now. Nothing was changed. Please try again in a moment.");
  }
  if (outcome.kind === "refused") return actionFail(outcome.message, outcome.field === null ? undefined : { [outcome.field]: outcome.message });
  // The closure locks the account on its own; ending every session as well means no device is left looking at it.
  try {
    await getAuth().api.revokeSessions({ headers: await headers() });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "settings.delete.revoke" });
  }
  redirect(`/login?notice=${ACCOUNT_CLOSED_NOTICE}`);
}
