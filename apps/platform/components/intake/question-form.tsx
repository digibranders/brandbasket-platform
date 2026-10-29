"use client";

import Link from "next/link";
import { useActionState, type ReactElement } from "react";
import { saveAnswerAction, type IntakeFormState } from "@/app/app-host/(protected)/personalize/actions";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { IntakeOption } from "@brandbasket/shared/lib/intake/questions";

interface QuestionFormProps {
  readonly field: string;
  readonly kind: "single" | "multi" | "url";
  readonly title: string;
  readonly hint: string;
  readonly options: readonly IntakeOption[];
  /** What is already saved: one value for a single choice and an address, several for a multi-choice. */
  readonly saved: readonly string[];
  readonly services: string;
  /** The question before this one, or null for the first. */
  readonly backHref: string | null;
  readonly optional: boolean;
}

const OPTION =
  "flex cursor-pointer items-start gap-3 rounded-control border border-ink-2/40 bg-surface p-4 transition-colors duration-200 hover:border-ink-2 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink";

/** One question: its choices as cards (a native radio or checkbox in each, so it works by keyboard and screen reader), and Continue. */
export function QuestionForm({ field, kind, title, hint, options, saved, services, backHref, optional }: QuestionFormProps): ReactElement {
  const [state, action, pending] = useActionState<IntakeFormState, FormData>(saveAnswerAction, { error: null });
  const errorId = "intake-error";
  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="services" value={services} />
      <fieldset className="grid gap-5" aria-describedby={state.error === null ? undefined : errorId}>
        <legend className="grid gap-1.5">
          <h1 className="font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
          <span className="text-base text-ink-2">{hint}</span>
        </legend>
        {kind === "url" ? (
          <label className="grid max-w-md gap-1.5 text-[0.9375rem] font-semibold text-ink">
            Website address{optional ? " (optional)" : ""}
            <input
              name="value"
              type="text"
              inputMode="url"
              autoComplete="url"
              defaultValue={saved[0] ?? ""}
              placeholder="yourbusiness.in"
              className="h-11 rounded-control border border-ink-2/65 bg-surface px-3 text-base font-normal text-ink"
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <label key={option.value} className={OPTION}>
                <input
                  type={kind === "multi" ? "checkbox" : "radio"}
                  name="value"
                  value={option.value}
                  defaultChecked={saved.includes(option.value)}
                  required={kind === "single"}
                  className="mt-1 size-4 shrink-0 accent-ink"
                />
                <span className="grid gap-0.5">
                  <span className="text-base font-semibold text-ink">{option.label}</span>
                  {option.hint === undefined ? null : <span className="text-[0.9375rem] text-ink-2">{option.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {state.error === null ? null : (
        <p id={errorId} role="alert" className="rounded-lg bg-error-wash px-4 py-3 text-[0.9375rem] text-error">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {backHref === null ? <span /> : (
          <Link href={backHref} className="inline-flex h-11 items-center rounded-lg px-3 text-[0.9375rem] font-semibold text-ink-2 hover:bg-sunken hover:text-ink">
            Back
          </Link>
        )}
        <button type="submit" disabled={pending} aria-busy={pending} className={DARK_BUTTON}>
          Continue
        </button>
      </div>
      <p className="-mt-3 text-right text-[0.8125rem] text-ink-3">Your answers save as you go.</p>
    </form>
  );
}
