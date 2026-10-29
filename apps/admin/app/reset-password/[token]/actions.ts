"use server";

import { redirect } from "next/navigation";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { parseResetPasswordForm, type ResetPasswordFormState } from "@/lib/account-recovery-form";
import { resetStaffPassword } from "@/lib/server/account-recovery";

export async function resetPasswordAction(_previous: ResetPasswordFormState, data: FormData): Promise<ResetPasswordFormState> {
  const human = await checkHuman(data, "staff_reset_password");
  if (!human.ok) return { status: "error", message: human.message };
  const parsed = parseResetPasswordForm(data);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await resetStaffPassword(parsed.token, parsed.password);
  if (outcome === "dead-link") return { status: "dead-link" };
  if (outcome === "limited") return { status: "error", message: "Too many tries from this network. Try again in an hour." };
  if (outcome === "failed") return { status: "error", message: "We couldn't save your password right now. Please try again." };
  redirect("/login?notice=password-changed");
}
