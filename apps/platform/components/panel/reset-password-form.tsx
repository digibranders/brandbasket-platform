"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { EyeIcon, EyeOffIcon } from "@brandbasket/shared/ui/icons";
import { FORGOT_PASSWORD_PATH, initialResetPasswordState, type ResetPasswordFormState } from "@/lib/account-recovery-form";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";

interface ResetPasswordFormProps {
  readonly action: (state: ResetPasswordFormState, formData: FormData) => Promise<ResetPasswordFormState>;
  readonly token: string;
}

const ERROR_ID = "reset-password-error";
/** The longest password the server accepts (lib/account-recovery-form.ts). */
const PASSWORD_MAX_LENGTH = 128;
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

/** Chooses the new password for the account a reset link belongs to. A dead link offers a new one instead. */
export function ResetPasswordForm({ action, token }: ResetPasswordFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialResetPasswordState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (isPending) return;
    if (state.status === "error") passwordRef.current?.focus();
    if (state.status === "dead-link") resultRef.current?.focus();
  }, [state, isPending]);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [confirmRevealed, setConfirmRevealed] = useState(false);
  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  if (state.status === "dead-link") {
    return (
      <div className="space-y-5">
        <p ref={resultRef} tabIndex={-1} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          This link no longer works. Reset links work once and expire after an hour.
        </p>
        <Link href={FORGOT_PASSWORD_PATH} className="link-underline text-sm">
          Email me a new link
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium">
          New password
          <RequiredMark />
        </label>
        <div className="relative">
          <input
            ref={passwordRef}
            id="reset-password"
            name="password"
            type={passwordRevealed ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={`${INPUT_CLASSES} pr-12`}
          />
          <button
            type="button"
            onClick={() => setPasswordRevealed((shown) => !shown)}
            aria-label={passwordRevealed ? "Hide password" : "Show password"}
            aria-pressed={passwordRevealed}
            className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
          >
            {passwordRevealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-soft">{PASSWORD_RULE}</p>
      </div>
      <div>
        <label htmlFor="reset-confirm" className="block text-sm font-medium">
          Repeat the password
          <RequiredMark />
        </label>
        <div className="relative">
          <input
            id="reset-confirm"
            name="confirmPassword"
            type={confirmRevealed ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={`${INPUT_CLASSES} pr-12`}
          />
          <button
            type="button"
            onClick={() => setConfirmRevealed((shown) => !shown)}
            aria-label={confirmRevealed ? "Hide password" : "Show password"}
            aria-pressed={confirmRevealed}
            className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
          >
            {confirmRevealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        </div>
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <TurnstileWidget action="reset_password" resetKey={state} />
      <SubmitButton disabled={isPending} className="w-full">
        {isPending ? "Saving…" : "Save new password"}
      </SubmitButton>
    </form>
  );
}
