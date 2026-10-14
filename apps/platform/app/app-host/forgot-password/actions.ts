"use server";

import { otpLimitMessage } from "@/lib/auth-retry";
import { redirect } from "next/navigation";
import type { ForgotPasswordFormState, ResetCodeStep } from "@/lib/account-recovery-form";
import { checkHuman } from "@firstfold/shared/server/turnstile-request";
import { requestPasswordReset } from "@/lib/server/account-recovery";
import { requestBrand } from "@/lib/server/request-brand";
import { parseForgotPasswordRequest, requestPhonePasswordReset, resetPasswordWithCode } from "@/lib/server/phone-password-reset";

/**
 * /forgot-password. An email is sent a one-time link (the only way under Fynix, whose accounts all have one). A mobile number is texted a code, and the same form is then
 * sent again with the code and the new password ("Send a new code" is the first send again); once the password is
 * changed the person signs in with it.
 */
export async function requestPasswordResetAction(
  previous: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  // Where the form was: on its code step (a code is out) or still asking who it is.
  const current: ResetCodeStep | null = previous.status === "code" || previous.status === "error" ? previous.otp : null;
  const human = await checkHuman(formData, "forgot_password");
  if (!human.ok) return { status: "error", message: human.message, otp: current };
  const resend = formData.get("resend") === "1";
  if (resend) {
    formData.delete("otpId");
    formData.delete("code");
  }

  const parsed = parseForgotPasswordRequest(formData, (await requestBrand()).signUpWith === "email" ? "email" : "phone-or-email");
  if (!parsed.success) {
    const onCodeStep = formData.get("otpId") !== null && formData.get("otpId") !== "";
    return { status: "error", message: parsed.message, otp: onCodeStep ? current : null };
  }

  const request = parsed.data;
  if (request.kind === "email") {
    const outcome = await requestPasswordReset(request.email);
    if (outcome === "limited") return { status: "error", message: "Too many requests from this network. Try again in an hour.", otp: null };
    if (outcome === "failed") return { status: "error", message: "We couldn't process email delivery right now. Please try again in a moment.", otp: null };
    return { status: "sent", email: request.email };
  }

  if (request.reset === null) {
    const outcome = await requestPhonePasswordReset(request.phone);
    if (outcome.kind === "code") return { status: "code", otp: outcome.otp };
    if (outcome.kind === "limited") return {
      status: "error", message: otpLimitMessage(outcome, "send"), otp: resend ? current : null,
      retry: { operation: "send", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds },
    };
    // A new code that could not be sent leaves the person where they were, with the old one still usable.
    return { status: "error", message: outcome.message, otp: resend ? current : null };
  }

  const outcome = await resetPasswordWithCode({ phone: request.phone, ...request.reset });
  if (outcome.kind === "limited") return {
    status: "error", message: otpLimitMessage(outcome, "confirm"), otp: current,
    retry: { operation: "confirm", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds },
  };
  if (outcome.kind === "wrong-code") return { status: "error", message: outcome.message, otp: current };
  redirect("/login?notice=password-changed");
}
