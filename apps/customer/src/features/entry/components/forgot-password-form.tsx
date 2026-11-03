"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Banner, Button, Field, Input } from "@/ui";
import { requestPasswordResetAction } from "../actions";
import { SIGN_IN_PATH } from "../rules/account-entry";
import { BRAND } from "../rules/brand";
import { FORGOT_PASSWORD_PATH } from "../rules/account-recovery-form";
import { TurnstileWidget } from "./turnstile";

/** Asks for the email or mobile number an account signs in with, and says the same thing whether or not it has one. */
export function ForgotPasswordForm({ siteKey }: { readonly siteKey: string | null }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);
  const [identifier, setIdentifier] = useState("");

  if (state?.ok === true && state.data !== undefined) {
    const { kind, typed } = state.data;
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="pos">
          {kind === "email"
            ? `If ${typed} has a ${BRAND.shortName} account, we’ve emailed it a link to choose a new password.`
            : `If ${typed} has a ${BRAND.shortName} account, we’ve emailed a link to choose a new password to the email address on it.`}{" "}
          The link works for one hour.
        </Banner>
        <p className="type-body text-ink-3">
          Nothing in your inbox after a few minutes? Check spam, or{" "}
          {/* A full page load, so the form comes back empty. */}
          <a href={FORGOT_PASSWORD_PATH}>ask for the link again</a>.
        </p>
        <Link href={SIGN_IN_PATH} className="type-body">
          Back to sign in
        </Link>
      </div>
    );
  }

  const error = state !== null && !state.ok && !pending ? state.message : null;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
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
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <TurnstileWidget siteKey={siteKey} action="forgot_password" resetKey={state} />
      <Button type="submit" variant="primary" size="lg" pending={pending}>
        Email me a link
      </Button>
      <p className="text-center type-meta">
        Remembered it? <Link href={SIGN_IN_PATH}>Sign in</Link>
      </p>
    </form>
  );
}
