"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { initialSignInState, type SignInFormState } from "@brandbasket/shared/lib/sign-in-form";
import { AuthField } from "./auth-field";

interface StaffSignInFormProps {
  readonly action: (state: SignInFormState, data: FormData) => Promise<SignInFormState>;
  readonly passwordChanged: boolean;
}

export function StaffSignInForm({ action, passwordChanged }: StaffSignInFormProps): ReactElement {
  const [state, formAction, pending] = useActionState(action, initialSignInState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const error = !pending && state.status === "error" ? state.message : null;
  useEffect(() => { if (error !== null) errorRef.current?.focus(); }, [error, state]);
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
