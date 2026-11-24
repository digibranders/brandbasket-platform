"use client";

import { useActionState, useEffect, useRef, type RefObject } from "react";
import { guardAction, restoreFormValues } from "@brandbasket/shared/lib/guard-action";

/** The text fields of a submitted form, by name, for a failure state that echoes what was typed. Files and ticks' extra entries are left out. */
export function typedValues(formData: FormData): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string") values[name] = value;
  return values;
}

/**
 * `useActionState` for a console form. A request that is dropped or rejected becomes the form's own failure state (built
 * by `onDropped`, in the shape the form already shows) instead of throwing the form away to an error screen, and what was
 * typed is put back into the fields once React has reset the form. Redirects and not found still reach Next.
 */
export function useGuardedFormState<S>(
  action: (state: S, formData: FormData) => Promise<S>,
  initial: S,
  onDropped: (message: string, formData: FormData, previous: S) => S,
  formRef?: RefObject<HTMLFormElement | null>,
): readonly [S, (formData: FormData) => void, boolean] {
  const dropped = useRef<{ readonly state: S; readonly sent: FormData } | null>(null);
  const guarded = async (previous: Awaited<S>, formData: FormData): Promise<S> =>
    guardAction(
      (sent: FormData) => action(previous as S, sent),
      (message, sent) => {
        const state = onDropped(message, sent, previous as S);
        dropped.current = { state, sent };
        return state;
      },
    )(formData);
  const [state, formAction, pending] = useActionState(guarded, initial as Awaited<S>);

  // After the commit that reset the form, so the typed values win.
  useEffect(() => {
    const last = dropped.current;
    if (last !== null && state === last.state && formRef?.current != null) restoreFormValues(formRef.current, last.sent);
  }, [state, formRef]);

  return [state as S, formAction, pending];
}
