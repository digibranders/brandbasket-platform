"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactElement } from "react";
import { ArrowLeft, ArrowRight, EnvelopeSimple } from "@phosphor-icons/react";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import type { ForgotPasswordFormState, ResetPasswordFormState } from "@/lib/account-recovery-form";
import { AuthField } from "./auth-field";

function BackToSignIn(): ReactElement {
  return <Link href="/login" className="auth-back"><ArrowLeft size={16} aria-hidden="true" />Back to sign in</Link>;
}

export function ForgotPasswordForm({ action }: { readonly action: (state: ForgotPasswordFormState, data: FormData) => Promise<ForgotPasswordFormState> }): ReactElement {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = !pending && state.status === "error" ? state.message : null;
  useEffect(() => { if (!pending && state.status !== "idle") statusRef.current?.focus(); }, [state, pending]);
  if (state.status === "sent") return (
    <div className="auth-form">
      <div className="auth-mail-mark"><EnvelopeSimple size={28} aria-hidden="true" /></div>
      <p ref={statusRef} tabIndex={-1} role="status" className="auth-success">If <strong className="break-words">{state.email}</strong> belongs to an active staff account, we&rsquo;ve emailed a reset link. It works once and expires in one hour.</p>
      <p className="auth-helper">Check your spam folder too. Need another link?{" "}
        {/* A full reload clears useActionState's sent state so the same route shows its form again. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/forgot-password">Try again</a>.
      </p>
      <BackToSignIn />
    </div>
  );
  return (
    <form action={formAction} noValidate className="auth-form" aria-busy={pending}>
      <AuthField id="recovery-email" name="email" label="Work email" type="email" autoComplete="username" maxLength={254} pending={pending} errorId={error === null ? undefined : "recovery-error"} />
      {error === null ? null : <p ref={statusRef} tabIndex={-1} id="recovery-error" role="alert" className="auth-error">{error}</p>}
      <TurnstileWidget action="staff_forgot_password" resetKey={state} />
      <SubmitButton disabled={pending} className="auth-submit">{pending ? "Sending link…" : "Send reset link"}<ArrowRight size={18} aria-hidden="true" /></SubmitButton>
      <BackToSignIn />
    </form>
  );
}

export function ResetPasswordForm({ action, token }: {
  readonly action: (state: ResetPasswordFormState, data: FormData) => Promise<ResetPasswordFormState>;
  readonly token: string;
}): ReactElement {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const statusRef = useRef<HTMLParagraphElement>(null);
  const error = !pending && state.status === "error" ? state.message : null;
  useEffect(() => { if (!pending && state.status !== "idle") statusRef.current?.focus(); }, [state, pending]);
  if (state.status === "dead-link") return (
    <div className="auth-form">
      <p ref={statusRef} tabIndex={-1} role="alert" className="auth-error">This link has expired, has already been used, or is unavailable for this account.</p>
      <Link href="/forgot-password" className="auth-recovery-link">Request a new reset link<ArrowRight size={18} aria-hidden="true" /></Link>
      <BackToSignIn />
    </div>
  );
  return (
    <form action={formAction} noValidate className="auth-form" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      <AuthField id="new-password" name="password" label="New password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} hintId="password-rule" pending={pending} errorId={error === null ? undefined : "reset-error"} />
      <p id="password-rule" className="auth-helper auth-password-hint">{PASSWORD_RULE}</p>
      <AuthField id="confirm-password" name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} pending={pending} errorId={error === null ? undefined : "reset-error"} />
      {error === null ? null : <p ref={statusRef} tabIndex={-1} id="reset-error" role="alert" className="auth-error">{error}</p>}
      <TurnstileWidget action="staff_reset_password" resetKey={state} />
      <SubmitButton disabled={pending} className="auth-submit">{pending ? "Saving password…" : "Save new password"}<ArrowRight size={18} aria-hidden="true" /></SubmitButton>
      <BackToSignIn />
    </form>
  );
}
