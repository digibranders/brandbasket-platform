"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement } from "react";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@firstfold/shared/ui/turnstile";
import { EyeIcon, EyeOffIcon } from "@firstfold/shared/ui/icons";
import { useBrand } from "@/components/panel/brand-provider";
import { legalLinksFor } from "@/lib/legal-links";
import { initialSetupFormState, SETUP_AGREE_FIELD, SETUP_AGREE_VALUE, SETUP_PASSWORD_MIN_LENGTH, type SetupFormState } from "@/lib/setup-form";

interface SetupFormProps {
  readonly action: (state: SetupFormState, formData: FormData) => Promise<SetupFormState>;
  readonly token: string;
  /** The form's name for the robot check; the server action must check the same one (checkHuman). */
  readonly turnstileAction: string;
  /**
   * The name the account is made under, when already known (an affiliate's, from staff). Prefills the field, or, with
   * `askName` off, is sent without asking.
   */
  readonly initialName?: string;
  /** Off for someone choosing a new password for an account that exists: nothing about their name is asked. */
  readonly askName?: boolean;
  readonly submitLabel?: string;
  readonly pendingLabel?: string;
}

const ERROR_ID = "setup-error";
/** The longest password and name the server accepts (lib/setup-form.ts). */
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 120;
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

/** Sets the customer's name and password for a redeemed setup invite, creating their account and business. */
export function SetupForm({
  action,
  token,
  turnstileAction,
  initialName = "",
  askName = true,
  submitLabel = "Create my account",
  pendingLabel = "Creating your account…",
}: SetupFormProps): ReactElement {
  const brand = useBrand();
  const legalLinks = legalLinksFor(brand);
  const [state, formAction, isPending] = useActionState(action, initialSetupFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const existing = state.status === "error" && state.mode === "verify-existing";
  useEffect(() => {
    if (isPending || state.status !== "error") return;
    const field = formRef.current?.elements.namedItem(state.field ?? "password");
    if (field instanceof HTMLElement) field.focus();
  }, [state, isPending]);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [confirmRevealed, setConfirmRevealed] = useState(false);
  /** Never ticked for the person: agreeing to the Terms and Privacy Notice is their own act (DPDP Act s.6). */
  const [agreed, setAgreed] = useState(false);
  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={existing ? "verify-existing" : "create"} />
      {askName ? (
        <div>
          <label htmlFor="setup-name" className="block text-sm font-medium">
            Your name
            <RequiredMark />
          </label>
          <RuleInput
            id="setup-name"
            name="name"
            rule="personName"
            required
            defaultValue={initialName}
            autoComplete="name"
            maxLength={NAME_MAX_LENGTH}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={INPUT_CLASSES}
          />
        </div>
      ) : (
        <input type="hidden" name="name" value={initialName} />
      )}
      <div>
        <label htmlFor="setup-password" className="block text-sm font-medium">
          {existing ? "Your existing account’s password" : "Choose a password"}
          <RequiredMark />
        </label>
        <div className="relative">
          <input
            key={existing ? "existing" : "new"}
            id="setup-password"
            name="password"
            type={passwordRevealed ? "text" : "password"}
            required
            autoComplete={existing ? "current-password" : "new-password"}
            minLength={existing ? undefined : SETUP_PASSWORD_MIN_LENGTH}
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
        {existing ? (
          <p className="mt-2 text-sm text-ink-soft">Verify your {brand.shortName} account to finish linking this invite.</p>
        ) : <p className="mt-2 text-sm text-ink-soft">At least {SETUP_PASSWORD_MIN_LENGTH} characters.</p>}
      </div>
      {existing ? null : <div>
        <label htmlFor="setup-confirm" className="block text-sm font-medium">
          Repeat the password
          <RequiredMark />
        </label>
        <div className="relative">
          <input
            id="setup-confirm"
            name="confirmPassword"
            type={confirmRevealed ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={SETUP_PASSWORD_MIN_LENGTH}
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
      </div>}
      {/* A new account asks for the tick; linking an existing account, or choosing a new password, does not. */}
      {existing || !askName ? null : (
        <label htmlFor="setup-agree" className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
          <input
            id="setup-agree"
            name={SETUP_AGREE_FIELD}
            type="checkbox"
            value={SETUP_AGREE_VALUE}
            required
            checked={agreed}
            disabled={isPending}
            onChange={(event) => setAgreed(event.target.checked)}
            aria-describedby={describedBy}
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
          />
          <span>
            I agree to the{" "}
            <a href={legalLinks.terms} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
              Terms
            </a>{" "}
            and the{" "}
            <a href={legalLinks.privacy} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
              Privacy Notice
            </a>
            .<RequiredMark />
          </span>
        </label>
      )}

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <TurnstileWidget action={turnstileAction} resetKey={state} />
      <SubmitButton disabled={isPending} className="w-full">
        {existing ? (isPending ? "Verifying your account…" : "Verify and link my account") : (isPending ? pendingLabel : submitLabel)}
      </SubmitButton>
    </form>
  );
}
