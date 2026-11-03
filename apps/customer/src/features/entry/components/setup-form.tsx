"use client";

import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { useActionState, useEffect, useRef, useState } from "react";
import { Banner, Button, Checkbox, Field, Input } from "@/ui";
import { completeSetupAction } from "../actions";
import { BRAND, LEGAL_LINKS } from "../rules/brand";
import { SETUP_AGREE_FIELD, SETUP_AGREE_VALUE, type SetupField } from "../rules/setup-form";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile";

/** Sets the owner's name and password for a staff setup link, creating their account and business. */
export function SetupForm({ siteKey, token }: { readonly siteKey: string | null; readonly token: string }) {
  const [state, formAction, pending] = useActionState(completeSetupAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  // Never ticked for the person: agreeing to the Terms and Privacy Notice is their own act (DPDP Act s.6).
  const [agreed, setAgreed] = useState(false);
  const failure = state !== null && !state.ok ? state : null;
  const existing = failure?.mode === "verify-existing";
  const focusField: SetupField = failure?.field ?? "password";
  const error = failure !== null && !pending ? failure.message : null;

  useEffect(() => {
    if (pending || failure === null) return;
    const field = formRef.current?.elements.namedItem(focusField);
    if (field instanceof HTMLElement) field.focus();
  }, [failure, focusField, pending]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={existing ? "verify-existing" : "create"} />
      <Field label="Your name" name="name">
        <Input name="name" required autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field
        label={existing ? "Your existing account’s password" : "Choose a password"}
        name="password"
        hint={existing ? `Verify your ${BRAND.shortName} account to finish linking this invite.` : PASSWORD_RULE}
      >
        <PasswordInput
          key={existing ? "existing" : "new"}
          name="password"
          required
          autoComplete={existing ? "current-password" : "new-password"}
          minLength={existing ? undefined : PASSWORD_MIN_LENGTH}
          maxLength={128}
        />
      </Field>
      {existing ? null : (
        <>
          <Field label="Repeat the password" name="confirmPassword">
            <PasswordInput name="confirmPassword" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
          </Field>
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
        </>
      )}
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <TurnstileWidget siteKey={siteKey} action="setup" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending}>
        {existing ? "Verify and link my account" : "Create my account"}
      </Button>
    </form>
  );
}
