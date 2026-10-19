"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactElement } from "react";
import { clientBrandName } from "@brandbasket/shared/lib/deployment-brand";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { FORGOT_PASSWORD_PATH, initialForgotPasswordState, type ForgotPasswordFormState } from "@/lib/account-recovery-form";

interface ForgotPasswordFormProps {
  readonly action: (state: ForgotPasswordFormState, formData: FormData) => Promise<ForgotPasswordFormState>;
  /** What the "If … has a … account" line calls the product. */
  readonly brandName?: string;
}

const ERROR_ID = "forgot-password-error";
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";

/**
 * Asks for the email the account signs in with and sends it a link to choose a new password. What it says afterwards is
 * the same whether or not the address has an account. The address is held here, so a refused submission leaves the form
 * as it was.
 */
export function ForgotPasswordForm({ action, brandName = clientBrandName() }: ForgotPasswordFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialForgotPasswordState);
  const [identifier, setIdentifier] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  useEffect(() => {
    if (isPending) return;
    if (errorMessage !== null) errorRef.current?.focus();
    else if (state.status === "sent") resultRef.current?.focus();
  }, [state, isPending, errorMessage]);

  if (state.status === "sent") {
    return (
      <div className="space-y-5">
        <p ref={resultRef} tabIndex={-1} role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          If {state.email} has a {brandName} account, we&rsquo;ve emailed it a link to choose a new password. The link works for
          one hour.
        </p>
        <p className="text-sm text-ink-soft">
          Nothing in your inbox after a few minutes? Check spam, or{" "}
          {/* A full page load, so the form comes back empty rather than showing this message again. */}
          <a href={FORGOT_PASSWORD_PATH} className="link-underline">
            ask for the link again
          </a>
          .
        </p>
        <Link href="/login" className="link-underline text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <div>
        <label htmlFor="forgot-identifier" className="block text-sm font-medium">
          Email
          <RequiredMark />
        </label>
        <input
          id="forgot-identifier"
          name="identifier"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={254}
          placeholder="you@yourbusiness.com"
          value={identifier}
          readOnly={isPending}
          onChange={(event) => setIdentifier(event.target.value)}
          aria-invalid={errorMessage === null ? undefined : true}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
      </div>

      {errorMessage === null ? null : (
        <p ref={errorRef} tabIndex={-1} id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <TurnstileWidget action="forgot_password" resetKey={state} />

      <SubmitButton disabled={isPending} className="w-full">
        {isPending ? "Sending…" : "Email me a link"}
      </SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="link-underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
