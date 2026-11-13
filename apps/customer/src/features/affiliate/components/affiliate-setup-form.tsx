"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/features/entry/components/password-input";
import { TurnstileWidget } from "@/features/entry/components/turnstile";
import { LEGAL_LINKS } from "@/features/entry/rules/brand";
import { SETUP_AGREE_FIELD, SETUP_AGREE_VALUE, type SetupField } from "@/features/entry/rules/setup-form";
import { Banner, Button, Checkbox, Field, Input } from "@/ui";
import { completeAffiliateSetupAction } from "../actions";

export type AffiliateSetupMode = "new-password" | "link-existing" | "create";

const SUBMIT_LABELS: Readonly<Record<AffiliateSetupMode, string>> = {
  "new-password": "Save password",
  "link-existing": "Link my account",
  create: "Create my account",
};

export interface AffiliateSetupFormProps {
  readonly siteKey: string | null;
  readonly token: string;
  /** The name the console has for them; asked again only when an account is being created. */
  readonly initialName: string;
  /** What the link is for: a new password for an affiliate who already signs in, the password of the account the address has, or a new account. */
  readonly mode: AffiliateSetupMode;
}

/** The form of an affiliate's one-use link. The server decides everything; this walks the person through and keeps focus on the field to fix. */
export function AffiliateSetupForm({ siteKey, token, initialName, mode }: AffiliateSetupFormProps) {
  const [state, formAction, pending] = useActionState(completeAffiliateSetupAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initialName);
  // Never ticked for the person: agreeing to the Terms and Privacy Notice is their own act (DPDP Act s.6).
  const [agreed, setAgreed] = useState(false);
  const failure = state !== null && !state.ok ? state : null;
  // A refusal can turn the form into the existing-account step; otherwise it stays what the link is for.
  const effective: AffiliateSetupMode = failure?.mode === "verify-existing" ? "link-existing" : mode;
  const focusField: SetupField = failure?.field ?? "password";
  const error = failure !== null && !pending ? failure.message : null;

  useEffect(() => {
    if (pending || failure === null) return;
    const field = formRef.current?.elements.namedItem(focusField);
    if (field instanceof HTMLElement) field.focus();
  }, [failure, focusField, pending]);

  const choosingPassword = effective !== "link-existing";
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={effective === "link-existing" ? "verify-existing" : "create"} />
      {effective === "create" ? (
        <Field label="Your name" name="name">
          <Input name="name" required autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
      ) : (
        <input type="hidden" name="name" value={initialName} />
      )}
      <Field
        label={choosingPassword ? "Choose a password" : "Your existing account’s password"}
        name="password"
        hint={choosingPassword ? PASSWORD_RULE : "Enter the password of the account this address already has."}
      >
        <PasswordInput
          key={choosingPassword ? "new" : "existing"}
          name="password"
          required
          autoComplete={choosingPassword ? "new-password" : "current-password"}
          minLength={choosingPassword ? PASSWORD_MIN_LENGTH : undefined}
          maxLength={128}
        />
      </Field>
      {choosingPassword ? (
        <Field label="Repeat the password" name="confirmPassword">
          <PasswordInput name="confirmPassword" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
        </Field>
      ) : null}
      {effective === "create" ? (
        <Checkbox
          name={SETUP_AGREE_FIELD}
          value={SETUP_AGREE_VALUE}
          required
          checked={agreed}
          onCheckedChange={setAgreed}
          label={
            <>
              I agree to the{" "}
              <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer">
                Terms
              </a>{" "}
              and the{" "}
              <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer">
                Privacy Notice
              </a>
              .
            </>
          }
        />
      ) : null}
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <TurnstileWidget siteKey={siteKey} action="affiliate_setup" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending}>
        {SUBMIT_LABELS[effective]}
      </Button>
    </form>
  );
}
