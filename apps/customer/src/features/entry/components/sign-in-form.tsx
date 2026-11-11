"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Banner, Button, Field, Input } from "@/ui";
import { signInAction } from "../actions";
import { NEXT_FIELD, SIGN_UP_PATH, withInviteReturn } from "../rules/account-entry";
import { LEGAL_LINKS } from "../rules/brand";
import { PasswordInput } from "./password-input";
import { TurnstileWidget } from "./turnstile";

export interface SignInFormProps {
  readonly siteKey: string | null;
  /** A fixed message the address picked (?notice=), shown until a sign-in is tried. */
  readonly notice?: string;
  /** The invite page to return to after signing in (already checked by the page), or null. */
  readonly next?: string | null;
}

/** Sign in with the email or mobile number the account was opened with, and its password. */
export function SignInForm({ siteKey, notice, next = null }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(signInAction, null);
  // Held here so a refused sign-in keeps what was typed (the form is reset after every send).
  const [identifier, setIdentifier] = useState("");
  const error = state !== null && !state.ok && !pending ? state.message : null;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {next === null ? null : <input type="hidden" name={NEXT_FIELD} value={next} />}
      {notice === undefined || state !== null ? null : <Banner tone="info">{notice}</Banner>}
      <Field label="Email or mobile number" name="identifier">
        <Input
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={254}
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </Field>
      <Field label="Password" name="password">
        <PasswordInput name="password" autoComplete="current-password" maxLength={128} required />
      </Field>
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <TurnstileWidget siteKey={siteKey} action="sign_in" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending}>
        Sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 type-meta">
        <Link href="/forgot-password">Forgot your password?</Link>
        <span>
          New here? <Link href={withInviteReturn(SIGN_UP_PATH, next)}>Create an account</Link>
        </span>
      </div>
      <p className="type-meta">
        By signing in you agree to the{" "}
        <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer">
          Terms
        </a>{" "}
        and the{" "}
        <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer">
          Privacy Notice
        </a>
        .
      </p>
    </form>
  );
}
