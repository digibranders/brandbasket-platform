"use client";

import { useActionState } from "react";
import { Banner, Button, Checkbox, Field, Input, LinkButton, RadioCard, RadioGroup } from "@/ui";
import { saveAnswerAction } from "../actions";
import type { StartQuestion } from "../loader";

/** One question: its choices, then Continue. Every answer is saved as it is given, so a refresh or Back resumes. */
export function QuestionForm({ question, services }: { readonly question: StartQuestion; readonly services: string }) {
  const [state, action, pending] = useActionState(saveAnswerAction, null);
  const error = state !== null && !state.ok && !pending ? state.message : null;
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="field" value={question.field} />
      <input type="hidden" name="services" value={services} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 flex flex-col gap-1">
          <span className="font-display text-2xl font-bold tracking-tight text-ink">{question.title}</span>
          <span className="type-body text-ink-3">{question.hint}</span>
        </legend>
        {question.kind === "url" ? (
          <Field label={`Website address${question.optional ? " (optional)" : ""}`} name="value" className="max-w-100">
            <Input name="value" type="text" inputMode="url" autoComplete="url" defaultValue={question.saved[0] ?? ""} placeholder="yourbusiness.in" />
          </Field>
        ) : question.kind === "single" ? (
          <RadioGroup name="value" defaultValue={question.saved[0]} required aria-label={question.title} className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => (
              <RadioCard key={option.value} value={option.value} label={option.label} description={option.hint ?? ""} />
            ))}
          </RadioGroup>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => (
              <Checkbox
                key={option.value}
                name="value"
                value={option.value}
                defaultChecked={question.saved.includes(option.value)}
                label={option.hint === undefined ? option.label : `${option.label}: ${option.hint}`}
              />
            ))}
          </div>
        )}
      </fieldset>
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        {question.backHref === null ? <span /> : (
          <LinkButton href={question.backHref} variant="ghost">
            Back
          </LinkButton>
        )}
        <Button type="submit" variant="primary" pending={pending}>
          Continue
        </Button>
      </div>
      <p className="type-meta text-right">Your answers save as you go.</p>
    </form>
  );
}
