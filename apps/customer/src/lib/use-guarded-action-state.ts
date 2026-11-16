"use client";

import { useActionState, useEffect, useRef, type RefObject } from "react";
import { guardAction, restoreFormValues } from "@brandbasket/shared/lib/guard-action";
import { actionFail, type ActionResult } from "./action-result";

export interface GuardedActionOptions {
  /** The form's own ref, when it already has one. Otherwise the hook makes one and returns it. */
  readonly formRef?: RefObject<HTMLFormElement | null>;
}

type Dropped<S> = { readonly state: S; readonly sent: FormData };

/**
 * `useActionState` for a form whose action returns an ActionResult. A request that is dropped or rejected does not throw the
 * form away to an error screen: it becomes the failure the form already shows, and what was typed is put back after React
 * resets the form. Every server action failure type extends ActionFailure, so the cast below only widens to its own shape.
 */
export function useGuardedActionState<S extends ActionResult<unknown>>(
  action: (previous: S | null, formData: FormData) => Promise<S>,
  initial: S | null = null,
  options: GuardedActionOptions = {},
): readonly [S | null, (formData: FormData) => void, boolean, RefObject<HTMLFormElement | null>] {
  const ownRef = useRef<HTMLFormElement>(null);
  const formRef = options.formRef ?? ownRef;
  const dropped = useRef<Dropped<S> | null>(null);

  const guarded = async (previous: Awaited<S> | null, formData: FormData): Promise<S | null> => {
    const run = guardAction(
      (sent: FormData) => action(previous as S | null, sent),
      (message): S => {
        const state = actionFail(message) as Extract<S, { readonly ok: false }>;
        dropped.current = { state, sent: formData };
        return state;
      },
    );
    return run(formData);
  };
  const [state, formAction, pending] = useActionState(guarded, initial as Awaited<S> | null);

  // After the commit that reset the form, so the typed values win.
  useEffect(() => {
    const last = dropped.current;
    if (last !== null && state === last.state && formRef.current !== null) restoreFormValues(formRef.current, last.sent);
  }, [state, formRef]);

  return [state, formAction, pending, formRef];
}
