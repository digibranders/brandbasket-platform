"use client";

import { useActionState, useState, type ReactElement } from "react";
import { EyeIcon, EyeOffIcon } from "@firstfold/shared/ui/icons";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { initialChangePasswordState, initialRevokeOtherSessionsState, type ChangePasswordFormState, type RevokeOtherSessionsState } from "@/lib/account-settings-form";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";

interface ChangePasswordFormProps {
  readonly action: (state: ChangePasswordFormState, formData: FormData) => Promise<ChangePasswordFormState>;
  readonly revokeAction: (state: RevokeOtherSessionsState) => Promise<RevokeOtherSessionsState>;
}

const ERROR_ID = "change-password-error";
/** The longest password the server accepts (lib/account-settings-form.ts). */
const PASSWORD_MAX_LENGTH = 128;
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 pr-12 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

interface PasswordFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly autoComplete: "current-password" | "new-password";
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly minLength?: number;
}

/** A password input with its own show/hide toggle. Uncontrolled: the form posts what was typed. */
function PasswordField({ id, name, label, autoComplete, describedBy, invalid, minLength }: PasswordFieldProps): ReactElement {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        <RequiredMark />
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          required
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
        <button
          type="button"
          onClick={() => setRevealed((shown) => !shown)}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
        >
          {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
        </button>
      </div>
    </div>
  );
}

/** Settings → Password. Asks for the current one, then the new one twice; other devices are signed out on success. */
export function ChangePasswordForm({ action, revokeAction }: ChangePasswordFormProps): ReactElement {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [state, formAction, isPending] = useActionState(async (previous: ChangePasswordFormState, data: FormData) => {
    setNoticeDismissed(false);
    return action(previous, data);
  }, initialChangePasswordState);
  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;
  const invalid = errorMessage !== null;

  return (
    <div className="max-w-md space-y-5">
      {/* Keyed on the outcome: a saved change clears the three fields instead of leaving the passwords on screen. */}
      <form key={state.status} action={formAction} onInput={() => setNoticeDismissed(true)} noValidate aria-busy={isPending} className="space-y-5">
        <PasswordField
          id="current-password"
          name="currentPassword"
          label="Current password"
          autoComplete="current-password"
          describedBy={describedBy}
          invalid={invalid}
        />
        <PasswordField
          id="new-password"
          name="newPassword"
          label="New password"
          autoComplete="new-password"
          describedBy={describedBy}
          invalid={invalid}
          minLength={SETUP_PASSWORD_MIN_LENGTH}
        />
        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label="Repeat the new password"
          autoComplete="new-password"
          describedBy={describedBy}
          invalid={invalid}
          minLength={SETUP_PASSWORD_MIN_LENGTH}
        />
        <p className="text-sm text-ink-soft">At least {SETUP_PASSWORD_MIN_LENGTH} characters. Changing your password also signs out your other devices.</p>

        {errorMessage === null ? null : (
          <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {errorMessage}
          </p>
        )}
        {state.status === "changed" && !isPending && !noticeDismissed ? (
          <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            Your password is changed.
          </p>
        ) : null}

        <SubmitButton disabled={isPending}>{isPending ? "Saving…" : "Change password"}</SubmitButton>
      </form>
      {state.status === "changed-revoke-failed" && !isPending ? <SessionRevocationRetry action={revokeAction} noticeDismissed={noticeDismissed} /> : null}
    </div>
  );
}

/** This form sends no passwords and retries only signing out the other devices. */
function SessionRevocationRetry({ action, noticeDismissed }: {
  readonly action: ChangePasswordFormProps["revokeAction"];
  readonly noticeDismissed: boolean;
}): ReactElement | null {
  const [state, formAction, isPending] = useActionState(action, initialRevokeOtherSessionsState);
  if (state.status === "revoked") {
    if (noticeDismissed) return null;
    return (
      <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
        Your password is changed. Your other devices are signed out.
      </p>
    );
  }
  return (
    <form action={formAction} aria-busy={isPending} className="space-y-3">
      <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
        Your password is changed, but your other devices could not be signed out. You can try signing them out again.
      </p>
      {state.status === "error" && !isPending ? <p role="alert" className="text-sm text-accent-deep">{state.message}</p> : null}
      <Button type="submit" disabled={isPending} aria-busy={isPending}>{isPending ? "Signing out…" : "Sign out other devices"}</Button>
    </form>
  );
}
