"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { AccountExitReason } from "@brandbasket/db";
import {
  DELETE_CONFIRMATION_WORD,
  EXIT_COMMENT_MAX_LENGTH,
  EXIT_REASON_OPTIONS,
} from "@brandbasket/shared/lib/account-exit";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { initialDeleteAccountState, type DeleteAccountState } from "@/lib/account-settings-form";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "@/lib/account-closure-grace";

interface DeleteAccountFlowProps {
  readonly deleteAccount: (state: DeleteAccountState, formData: FormData) => Promise<DeleteAccountState>;
  /** When the paid plan ends (an ISO date), or null when there is no plan to end. */
  readonly planEndsAt: string | null;
  /** The business has an add-on running, which stops with the month it has paid for. */
  readonly addOnsRunning: boolean;
  /** What cancelling ends for a business that holds a package (packageEndsFor); empty when there is no package. */
  readonly packageEnds: readonly string[];
}

type Stage = "reason" | "confirm";

const FIELD_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";
const ERROR_CLASSES = "rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep";
/** The longest password the server accepts (lib/account-settings-form.ts). */
const PASSWORD_MAX_LENGTH = 128;

/** The hidden copy of what was said on the first step, so every later form carries it to the server. */
function CarriedDetails({ reason, comment }: { readonly reason: AccountExitReason; readonly comment: string }): ReactElement {
  return (
    <>
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="comment" value={comment} />
    </>
  );
}

/**
 * Delete account, in two steps. 1: why (and, if they like, a few words). 2: what deleting does, the word DELETE and the
 * password. Every outcome is decided on the server; this component only walks the person through, and holds what they
 * said between steps.
 */
export function DeleteAccountFlow({ deleteAccount, planEndsAt, addOnsRunning, packageEnds }: DeleteAccountFlowProps): ReactElement {
  const stageRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("reason");
  const [reason, setReason] = useState<AccountExitReason | null>(null);
  const [comment, setComment] = useState("");

  const [deletion, deleteAction, deletePending] = useActionState(deleteAccount, initialDeleteAccountState);

  useEffect(() => {
    if (stage === "confirm") stageRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (deletePending) return;
    if (deletion.status === "error" && deletion.field === "password") passwordRef.current?.focus();
    else if (deletion.status === "error") errorRef.current?.focus();
  }, [deletion, deletePending]);

  function continueToConfirm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setStage("confirm");
  }

  if (stage === "reason") {
    return (
      <form onSubmit={continueToConfirm} className="max-w-xl">
        <fieldset>
          <legend className="font-serif text-2xl leading-tight">
            Why are you leaving?
            <RequiredMark />
          </legend>
          <div className="mt-5 grid gap-1.5">
            {EXIT_REASON_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-base transition-colors duration-300 ease-calm hover:bg-paper-deep has-[:checked]:bg-accent-pale"
              >
                <input
                  type="radio"
                  name="reason"
                  value={option.value}
                  required
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="size-4 accent-accent"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="exit-comment" className="mt-7 block text-sm font-medium">
          Anything you’d like us to know? <span className="font-normal text-ink-soft">Optional</span>
        </label>
        <textarea
          id="exit-comment"
          name="comment"
          rows={3}
          maxLength={EXIT_COMMENT_MAX_LENGTH}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className={FIELD_CLASSES}
        />
        <p className="mt-2 text-sm text-ink-soft">We keep this without your name, to get better.</p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <SubmitButton disabled={reason === null}>Continue</SubmitButton>
          <Link href="/settings" className="link-underline text-sm">
            Keep my account
          </Link>
        </div>
      </form>
    );
  }

  const deleteError = deletion.status === "error" && !deletePending ? deletion.message : null;
  const passwordWrong = deleteError !== null && deletion.status === "error" && deletion.field === "password";
  return (
    <form action={deleteAction} noValidate className="max-w-md">
      {reason === null ? null : <CarriedDetails reason={reason} comment={comment} />}
      <p ref={stageRef} tabIndex={-1} className="font-serif text-2xl leading-tight outline-none">Delete your account</p>
      <ul className="mt-5 space-y-2.5 text-base text-ink-soft">
        {planEndsAt === null ? null : (
          <li>
            Your plan ends on <LocalDate iso={planEndsAt} />. You won’t be charged again.
          </li>
        )}
        {packageEnds.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {addOnsRunning ? <li>Your add-ons stop at the end of the month you’ve paid for.</li> : null}
        <li>You’re signed out everywhere and your dashboard is locked.</li>
        <li>
          After {ACCOUNT_CLOSURE_GRACE_DAYS} days your data is erased. Sign in before then and you can restore it.
        </li>
      </ul>
      <div className="mt-7">
        <label htmlFor="delete-confirmation" className="block text-sm font-medium">
          Type {DELETE_CONFIRMATION_WORD} to confirm
          <RequiredMark />
        </label>
        <RuleInput
          id="delete-confirmation"
          name="confirmation"
          rule="code"
          required
          pattern={DELETE_CONFIRMATION_WORD}
          title={`Type ${DELETE_CONFIRMATION_WORD} in capitals`}
          maxLength={DELETE_CONFIRMATION_WORD.length}
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASSES}
        />
      </div>
      <div className="mt-5">
        <label htmlFor="delete-password" className="block text-sm font-medium">
          Your password
          <RequiredMark />
        </label>
        <input
          ref={passwordRef}
          id="delete-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={passwordWrong ? true : undefined}
          aria-describedby={deleteError === null ? undefined : "delete-account-error"}
          className={FIELD_CLASSES}
        />
      </div>
      {deleteError === null ? null : (
        <p id="delete-account-error" ref={errorRef} tabIndex={-1} role="alert" className={`mt-5 ${ERROR_CLASSES}`}>
          {deleteError}
        </p>
      )}
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <SubmitButton disabled={deletePending}>{deletePending ? "Deleting…" : "Delete my account"}</SubmitButton>
        <Link href="/settings" className="link-underline text-sm">
          Keep my account
        </Link>
      </div>
    </form>
  );
}
