"use server";

import type { ForgotPasswordFormState } from "@/lib/account-recovery-form";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { requestPasswordReset } from "@/lib/server/account-recovery";
import { parseAccountIdentifier } from "@/lib/server/customer-sign-in-form";

/**
 * /forgot-password. An email address, or a mobile number, is answered with a one-time link to choose a new password,
 * emailed to the address on the account; the form says the same thing whether or not there is an account. Once the
 * password is changed the person signs in with it.
 */
export async function requestPasswordResetAction(
  _previous: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const human = await checkHuman(formData, "forgot_password");
  if (!human.ok) return { status: "error", message: human.message };

  const entered = formData.get("identifier");
  const typed = typeof entered === "string" ? entered.trim() : "";
  const parsed = parseAccountIdentifier(typed);
  if (!parsed.success) return { status: "error", message: parsed.message };

  const { identifier } = parsed;
  const outcome = await requestPasswordReset(identifier);
  if (outcome === "limited") return { status: "error", message: "Too many requests from this network. Try again in an hour." };
  if (outcome === "failed") return { status: "error", message: "We couldn't process email delivery right now. Please try again in a moment." };
  return identifier.kind === "email"
    ? { status: "sent", kind: "email", typed: identifier.email }
    : { status: "sent", kind: "phone", typed };
}
