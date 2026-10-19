"use server";

import { redirect } from "next/navigation";
import { parseResetPasswordForm, type ResetPasswordFormState } from "@/lib/account-recovery-form";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { resetPassword } from "@/lib/server/account-recovery";

export async function resetPasswordAction(_previous: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  const human = await checkHuman(formData, "reset_password");
  if (!human.ok) return { status: "error", message: human.message };

  const parsed = parseResetPasswordForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };

  const outcome = await resetPassword(parsed.token, parsed.password);
  if (outcome === "dead-link") return { status: "dead-link" };
  if (outcome === "limited") return { status: "error", message: "Too many tries from this network. Try again in an hour." };
  // Every session of the account has just been ended, so they sign in with the new password.
  redirect("/login?notice=password-changed");
}
