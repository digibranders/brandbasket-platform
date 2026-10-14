"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { TurnstileWidget } from "../turnstile";
import { SubmitButton } from "./submit-button";
import { ArrowIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, PhoneIcon } from "@firstfold/shared/ui/icons";
import { initialSignInState, type SignInFormState } from "../../lib/sign-in-form";

interface SignInFormProps {
  readonly action: (state: SignInFormState, formData: FormData) => Promise<SignInFormState>;
  /** The form's name for the robot check; the server action must check the same one (checkHuman). */
  readonly turnstileAction: string;
  readonly submitLabel: string;
  /** Shown under the button behind an "or" rule. Left out on surfaces with nothing to add. */
  readonly footer?: ReactNode;
  /** A line straight under the button, for a surface that points people at its terms. Left out where there is none. */
  readonly agreementNote?: ReactNode;
  /** Where someone who has forgotten their password asks for a new one. Left out on a surface with no such page. */
  readonly forgotPasswordHref?: string;
  /**
   * What the first field takes. `email` (the default, the staff console): an email address, sent as `email`.
   * `phone-or-email` (the customer dashboard): a mobile number or an email, sent as `identifier`.
   * `customer-email` (the customer dashboard of a brand whose accounts are opened with an email, Fynix): asks for an
   * email only, sent as `identifier` all the same, so the same server action reads it.
   */
  readonly identifier?: "email" | "phone-or-email" | "customer-email";
  /** What the page wants said above the fields (for example that a password was just changed). Gone once a sign-in is tried. */
  readonly notice?: string;
}

const ERROR_ID = "sign-in-error";
const INPUT_CLASSES =
  "block w-full rounded-control border border-ink-soft/65 bg-white py-2.5 pl-10 pr-3 text-sm text-ink sm:py-3 sm:pl-12 sm:pr-4 sm:text-base transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";

/**
 * Shared password sign-in form for both panel surfaces: by email on the staff console, by mobile number or email on
 * the customer dashboard. The error is hidden while the action runs,
 * so a repeated failure unmounts and remounts the alert and is announced again instead of sitting silent.
 */
export function SignInForm({ action, turnstileAction, submitLabel, footer, agreementNote, forgotPasswordHref, identifier = "email", notice }: SignInFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialSignInState);
  const [revealed, setRevealed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const asksEmail = identifier !== "phone-or-email";
  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  // The submit button is disabled while pending, so focus would otherwise be lost to the document body.
  useEffect(() => {
    if (state.status === "error") emailRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="space-y-4 sm:space-y-5">
      {notice === undefined || state.status === "error" ? null : (
        <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {notice}
        </p>
      )}
      <div>
        <label htmlFor="sign-in-email" className="sr-only">
          {asksEmail ? "Email" : "Mobile number"}
        </label>
        <div className="relative">
          <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft sm:left-4">
            {asksEmail ? <MailIcon className="size-4 sm:size-5" /> : <PhoneIcon className="size-4 sm:size-5" />}
          </span>
          <input
            ref={emailRef}
            id="sign-in-email"
            name={identifier === "email" ? "email" : "identifier"}
            // A number or an address: a plain text box, so a phone's keyboard offers both digits and letters.
            type={asksEmail ? "email" : "text"}
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={254}
            required
            // Only the number is asked for out loud: it is what nearly everyone here signs in with. An email typed
            // instead still signs a website client in.
            // The label is visually hidden, so the required mark rides on the placeholder.
            placeholder={asksEmail ? "you@example.com *" : "Mobile number *"}
            defaultValue={state.status === "error" ? state.email : ""}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={INPUT_CLASSES}
          />
        </div>
      </div>

      <div>
        <label htmlFor="sign-in-password" className="sr-only">
          Password
        </label>
        <div className="relative">
          <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft sm:left-4">
            <LockIcon className="size-4 sm:size-5" />
          </span>
          <input
            id="sign-in-password"
            name="password"
            type={revealed ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password *"
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={`${INPUT_CLASSES} pr-11 sm:pr-12`}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
          >
            {revealed ? <EyeOffIcon className="size-4 sm:size-5" /> : <EyeIcon className="size-4 sm:size-5" />}
          </button>
        </div>
        {forgotPasswordHref === undefined ? null : (
          <p className="mt-2 text-right text-xs sm:text-sm">
            <a href={forgotPasswordHref} className="text-ink-soft transition-colors duration-300 ease-calm hover:text-ink">
              Forgot your password?
            </a>
          </p>
        )}
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <TurnstileWidget action={turnstileAction} resetKey={state} />

      {/* Disabled until both fields hold something, and while the sign-in runs. */}
      <SubmitButton disabled={isPending} className="group w-full py-3 sm:py-3.5">
        {isPending ? "Signing in…" : submitLabel}
        <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
      </SubmitButton>

      {agreementNote === undefined ? null : <p className="text-center text-xs leading-relaxed text-ink-soft sm:text-sm">{agreementNote}</p>}

      {footer === undefined ? null : (
        <div className="pt-2">
          <p aria-hidden="true" className="flex items-center gap-4 text-[0.8125rem] text-ink-soft">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </p>
          <div className="mt-5 text-center text-sm leading-relaxed text-ink-soft">{footer}</div>
        </div>
      )}
    </form>
  );
}
