"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionFailure, ActionResult } from "@/lib/action-result";

export interface ActionForm {
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
  readonly pending: boolean;
  /** The refusal the last submit got, or null. */
  readonly failure: ActionFailure | null;
  /** The message for one field, shown under it. */
  readonly errorOf: (name: string) => string | undefined;
  readonly clear: () => void;
}

/**
 * Submits a form to a server action without the browser resetting it: a refused form keeps everything typed, and the caller
 * decides what a success does (clear the fields, close a dialog, show a toast). An action that redirects navigates from here.
 */
export function useActionForm<T = undefined>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  onSuccess?: (data: T | undefined, form: HTMLFormElement) => void,
): ActionForm {
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFailure(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) onSuccess?.(result.data, form);
      else setFailure(result);
    });
  }

  return { submit, pending, failure, errorOf: (name) => failure?.fieldErrors?.[name], clear: () => setFailure(null) };
}
