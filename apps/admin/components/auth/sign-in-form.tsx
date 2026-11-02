"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { initialSignInState } from "@brandbasket/shared/lib/sign-in-form";
import type { StaffCodeFormState, StaffSignInFormState } from "@/lib/staff-sign-in-form";
import { AuthField } from "./auth-field";
import { StaffCodeForm } from "./code-form";

interface StaffSignInFormProps {
  readonly action: (state: StaffSignInFormState, data: FormData) => Promise<StaffSignInFormState>;
  readonly confirmAction: (state: StaffCodeFormState, data: FormData) => Promise<StaffCodeFormState>;
  readonly passwordChanged: boolean;
}

export function StaffSignInForm({ action, confirmAction, passwordChanged }: StaffSignInFormProps): ReactElement {
  const [state, formAction, pending] = useActionState(action, initialSignInState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const error = !pending && state.status === "error" ? state.message : null;
  useEffect(() => { if (error !== null) errorRef.current?.focus(); }, [error, state]);
  if (state.status === "code") return <StaffCodeForm action={confirmAction} email={state.email} otpId={state.otpId} />;
  return (
    <form action={formAction} className="auth-form" noValidate aria-busy={pending}>
      {passwordChanged && state.status === "idle" ? <p className="auth-success" role="status">Password updated. Sign in with your new password.</p> : null}
      <AuthField id="staff-email" name="email" label="Work email" type="email" autoComplete="username" maxLength={254} pending={pending} errorId={error === null ? undefined : "sign-in-error"} />
      <AuthField id="staff-password" name="password" label="Password" type="password" autoComplete="current-password" pending={pending} errorId={error === null ? undefined : "sign-in-error"} />
      <div className="auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
      {error === null ? null : <p ref={errorRef} tabIndex={-1} id="sign-in-error" role="alert" className="auth-error">{error}</p>}
      <TurnstileWidget action="staff_sign_in" resetKey={state} />
      <SubmitButton disabled={pending} className="auth-submit">{pending ? "Signing in…" : "Sign in to console"}<ArrowRight size={18} aria-hidden="true" /></SubmitButton>
    </form>
  );
}
