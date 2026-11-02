"use client";

import { useActionState, useEffect, useRef, type ReactElement } from "react";
import { ArrowLeft, ArrowRight, LockKey } from "@phosphor-icons/react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { CODE_VALID_MINUTES, initialStaffCodeState, type StaffCodeFormState } from "@/lib/staff-sign-in-form";

interface StaffCodeFormProps {
  readonly action: (state: StaffCodeFormState, data: FormData) => Promise<StaffCodeFormState>;
  readonly email: string;
  readonly otpId: string;
}

/** The second step of the console sign-in: the code emailed after the password was right. */
export function StaffCodeForm({ action, email, otpId }: StaffCodeFormProps): ReactElement {
  const [state, formAction, pending] = useActionState(action, initialStaffCodeState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const error = !pending && state.status === "error" ? state.message : null;
  const restart = state.status === "error" && state.restart;
  useEffect(() => { if (error !== null) errorRef.current?.focus(); }, [error, state]);
  return (
    <form action={formAction} className="auth-form" noValidate aria-busy={pending}>
      <input type="hidden" name="otpId" value={otpId} />
      <p className="auth-helper">We emailed a 6-digit code to <strong className="break-words">{email}</strong>. It expires in {CODE_VALID_MINUTES} minutes.</p>
      <div className="auth-field">
        <label htmlFor="staff-code">Sign-in code</label>
        <div className="auth-input-wrap">
          <LockKey size={20} aria-hidden="true" />
          <input
            id="staff-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*"
            maxLength={12} required readOnly={pending} autoFocus spellCheck={false}
            placeholder="123456"
            aria-invalid={error === null ? undefined : true} aria-describedby={error === null ? undefined : "code-error"}
          />
        </div>
      </div>
      {error === null ? null : <p ref={errorRef} tabIndex={-1} id="code-error" role="alert" className="auth-error">{error}</p>}
      {restart ? null : <SubmitButton disabled={pending} className="auth-submit">{pending ? "Checking…" : "Sign in to console"}<ArrowRight size={18} aria-hidden="true" /></SubmitButton>}
      {/* A full reload clears the sign-in form's state, so the password step shows again. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/login" className="auth-back"><ArrowLeft size={16} aria-hidden="true" />Back to sign in</a>
    </form>
  );
}
