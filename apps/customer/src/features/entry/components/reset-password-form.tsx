"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { useActionState } from "react";
import { Banner, Button, Field, LinkButton } from "@/ui";
import { resetPasswordAction } from "../actions";
import { FORGOT_PASSWORD_PATH } from "../rules/account-recovery-form";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile";

/** Chooses the new password for the account a reset link belongs to. A dead link offers a new one instead. */
export function ResetPasswordForm({ siteKey, token }: { readonly siteKey: string | null; readonly token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  if (state !== null && !state.ok && state.deadLink === true) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warn">{state.message}</Banner>
        <LinkButton href={FORGOT_PASSWORD_PATH} variant="primary" size="lg">
          Email me a new link
        </LinkButton>
      </div>
    );
  }

  const error = state !== null && !state.ok && !pending ? state.message : null;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" hint={PASSWORD_RULE}>
        <PasswordInput name="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
      </Field>
      <Field label="Repeat the password" name="confirmPassword">
        <PasswordInput name="confirmPassword" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
      </Field>
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <TurnstileWidget siteKey={siteKey} action="reset_password" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending}>
        Save new password
      </Button>
    </form>
  );
}
