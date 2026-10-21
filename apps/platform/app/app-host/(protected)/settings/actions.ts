"use server";

import { redirect } from "next/navigation";
import {
  ACCOUNT_CLOSED_NOTICE,
  parseChangePasswordForm,
  parseDeleteForm,
  type ChangePasswordFormState,
  type DeleteAccountState,
  type RevokeOtherSessionsState,
} from "@/lib/account-settings-form";
import { closeAccountFor } from "@/lib/server/account-exit";
import { changePasswordFor, revokeOtherSessionsFor } from "@/lib/server/account-security";
import { getAuth } from "@/lib/server/auth";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { headers } from "next/headers";

/** The settings actions are open to every kind of account: a website client's, a free listing's, a member's. */
const ANY_ACCOUNT = { listingAccount: "allow", membershipCheckout: "allow" } as const;

/** Changes the signed-in account's password. The account is never taken from the form: it is the session's. */
export async function changePasswordAction(_previous: ChangePasswordFormState, formData: FormData): Promise<ChangePasswordFormState> {
  const parsed = parseChangePasswordForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const { user } = await requireCustomerAccess(ANY_ACCOUNT);
  const outcome = await changePasswordFor(user.id, { currentPassword: parsed.currentPassword, newPassword: parsed.newPassword });
  if (outcome === "wrong-password") return { status: "error", message: "That isn’t your current password." };
  if (outcome === "limited") return { status: "error", message: "Too many tries. Please wait a while and try again." };
  return { status: outcome };
}

/** Retries signing out other devices after the password has already changed; retains this session. */
export async function revokeOtherSessionsAction(): Promise<RevokeOtherSessionsState> {
  const { user } = await requireCustomerAccess(ANY_ACCOUNT);
  const outcome = await revokeOtherSessionsFor(user.id);
  if (outcome === "limited") return { status: "error", message: "Too many tries. Please wait a while and try again." };
  if (outcome === "failed") return { status: "error", message: "Your other devices could not be signed out. Please try again." };
  return { status: "revoked" };
}

/**
 * The last step: closes the account. Everything that matters is checked here, not in the browser: the word typed, the
 * password, and what the plan is. On success every device is signed out and the person lands on the sign-in page.
 */
export async function deleteAccountAction(_previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const parsed = parseDeleteForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, field: null };
  const customer = await requireCustomerAccess(ANY_ACCOUNT);
  const outcome = await closeAccountFor(customer, { ...parsed.details, password: parsed.password }, new Date());
  if (outcome.kind === "refused") return { status: "error", message: outcome.message, field: outcome.field };
  // The closure now locks the account on its own; ending every session as well means no device is left looking at it.
  await getAuth().api.revokeSessions({ headers: await headers() });
  redirect(`/login?notice=${ACCOUNT_CLOSED_NOTICE}`);
}
