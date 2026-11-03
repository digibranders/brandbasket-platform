"use client";

import { DELETE_CONFIRMATION_WORD, EXIT_COMMENT_MAX_LENGTH, EXIT_REASON_OPTIONS } from "@brandbasket/shared/lib/account-exit";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PasswordInput } from "@/features/entry/components/password-input";
import { formatDate } from "@/lib/format";
import { Banner, Button, Field, Input, LinkButton, Radio, RadioGroup, Textarea } from "@/ui";
import { deleteAccountAction } from "../actions";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "../rules/account-closure-grace";
import type { DeleteFacts } from "../loader";
import { useActionForm } from "./use-action-form";

type Stage = "reason" | "confirm";

const KEEP_PATH = "/settings/privacy";

/**
 * Delete account, in two steps. 1: why (and, if they like, a few words). 2: what deleting does, the word DELETE and the
 * password. Every outcome is decided on the server; this only walks the person through and holds what they said between
 * steps. Ported from apps/platform components/panel/delete-account-flow.tsx.
 */
export function DeleteAccountFlow({ facts }: { readonly facts: DeleteFacts }) {
  const [stage, setStage] = useState<Stage>("reason");
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const form = useActionForm(deleteAccountAction);

  useEffect(() => {
    if (stage === "confirm") headingRef.current?.focus();
  }, [stage]);

  const passwordError = form.failure?.fieldErrors?.password;
  useEffect(() => {
    if (form.pending || passwordError === undefined) return;
    const field = formRef.current?.elements.namedItem("password");
    if (field instanceof HTMLElement) field.focus();
  }, [form.failure, form.pending, passwordError]);

  function toConfirm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStage("confirm");
  }

  if (stage === "reason") {
    return (
      <form onSubmit={toConfirm} className="flex max-w-xl flex-col gap-4">
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="type-section">Why are you leaving?</legend>
          <RadioGroup name="reason" value={reason} onValueChange={setReason} required aria-label="Why are you leaving?">
            {EXIT_REASON_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value} label={option.label} />
            ))}
          </RadioGroup>
        </fieldset>
        <Field label="Anything you’d like us to know? Optional" name="comment" hint="We keep this without your name, to get better.">
          <Textarea name="comment" rows={3} maxLength={EXIT_COMMENT_MAX_LENGTH} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={reason === ""}>
            Continue
          </Button>
          <LinkButton href={KEEP_PATH} variant="ghost">
            Keep my account
          </LinkButton>
        </div>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={form.submit} noValidate className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="comment" value={comment} />
      <h2 ref={headingRef} tabIndex={-1} className="type-section outline-none">
        Delete your account
      </h2>
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5 type-body text-ink-2">
        {facts.planEndsAt === null ? null : <li>Your plan ends on {formatDate(new Date(facts.planEndsAt))}. You won’t be charged again.</li>}
        {facts.packageEnds.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {facts.addOnsRunning ? <li>Your services stop at the end of the month you’ve paid for.</li> : null}
        <li>You’re signed out everywhere and your dashboard is locked.</li>
        <li>After {ACCOUNT_CLOSURE_GRACE_DAYS} days your data is erased. Sign in before then and you can restore it.</li>
      </ul>
      {form.failure === null ? null : <Banner tone="neg">{form.failure.message}</Banner>}
      <Field label={`Type ${DELETE_CONFIRMATION_WORD} to confirm`} name="confirmation" error={form.errorOf("confirmation")}>
        <Input name="confirmation" required autoComplete="off" spellCheck={false} maxLength={DELETE_CONFIRMATION_WORD.length + 4} />
      </Field>
      <Field label="Your password" name="password" error={form.errorOf("password")}>
        <PasswordInput name="password" required autoComplete="current-password" maxLength={128} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" pending={form.pending}>
          Delete my account
        </Button>
        <LinkButton href={KEEP_PATH} variant="ghost">
          Keep my account
        </LinkButton>
      </div>
    </form>
  );
}
