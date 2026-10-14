"use client";

import { startTransition, useActionState, useId, type FormEvent, type ReactElement, type ReactNode } from "react";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { initialItemFormState, type ItemFormState } from "@/lib/item-form-state";

interface ItemFormProps {
  readonly action: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly submitLabel: string;
  /** Hidden inputs and fields, uncontrolled: the form keeps what was typed when a save is refused. */
  readonly children: ReactNode;
}

/**
 * A Business profile form that saves one thing. It sends itself from onSubmit rather than as a form action, because
 * React clears a form's fields once an action settles, and a refused save must leave the owner's typing as it was.
 * A save that works redirects (see the tab's action), so this only ever shows what went wrong.
 */
export function ItemForm({ action, submitLabel, children }: ItemFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialItemFormState);
  const errorId = useId();
  const message = state.status === "error" && !isPending ? state.message : null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={submit} noValidate aria-describedby={message === null ? undefined : errorId} className="space-y-5">
      {children}
      {message === null ? null : (
        <p id={errorId} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {message}
        </p>
      )}
      <SubmitButton size="sm" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </SubmitButton>
    </form>
  );
}
