"use server";

import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { formText, parseRecoveryEmail, type ForgotPasswordFormState } from "@/lib/account-recovery-form";
import { requestStaffPasswordReset } from "@/lib/server/account-recovery";

export async function requestPasswordResetAction(_previous: ForgotPasswordFormState, data: FormData): Promise<ForgotPasswordFormState> {
  const email = formText(data, "email").trim().toLowerCase();
  const human = await checkHuman(data, "staff_forgot_password");
  if (!human.ok) return { status: "error", message: human.message, email };
  const parsed = parseRecoveryEmail(data);
  if (!parsed.success) return { status: "error", message: parsed.message, email };
  const outcome = await requestStaffPasswordReset(parsed.email);
  if (outcome === "limited") return { status: "error", message: "Too many requests from this network. Try again in an hour.", email };
  if (outcome === "failed") return { status: "error", message: "We couldn't process your request right now. Please try again in a moment.", email };
  return { status: "sent", email: parsed.email };
}
