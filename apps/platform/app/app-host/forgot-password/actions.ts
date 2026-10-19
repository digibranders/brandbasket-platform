"use server";

import type { ForgotPasswordFormState } from "@/lib/account-recovery-form";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { requestPasswordReset } from "@/lib/server/account-recovery";
import { requiredEmail } from "@brandbasket/shared/lib/validation/contact";

/**
 * /forgot-password. An email address is sent a one-time link to choose a new password; the form says the same thing
 * whether or not the address has an account. Once the password is changed the person signs in with it.
 */
export async function requestPasswordResetAction(
  _previous: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const human = await checkHuman(formData, "forgot_password");
  if (!human.ok) return { status: "error", message: human.message };

  const typed = formData.get("identifier");
  const parsed = requiredEmail("Enter your email address.").safeParse(typeof typed === "string" ? typed : "");
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter your email address." };

  const email = parsed.data;
  const outcome = await requestPasswordReset(email);
  if (outcome === "limited") return { status: "error", message: "Too many requests from this network. Try again in an hour." };
  if (outcome === "failed") return { status: "error", message: "We couldn't process email delivery right now. Please try again in a moment." };
  return { status: "sent", email };
}
