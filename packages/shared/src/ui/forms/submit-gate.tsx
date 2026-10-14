"use client";

import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";

/** Changes to these can make a field required or not, or change what it accepts, without any typing. */
const WATCHED_ATTRIBUTES = ["required", "disabled", "readonly", "pattern", "min", "max", "minlength", "maxlength", "type"];

const alwaysComplete = (): boolean => true;

/**
 * Whether the form a button belongs to is ready to send: every `required` field filled and every value matching its
 * `type`, `pattern`, length and range, plus any custom validity a field has set. Read from the browser's own
 * constraint validation, so each field's attributes are the single statement of what it needs. `noValidate` forms
 * are covered too: `checkValidity` ignores that flag, which only turns off the browser's own error bubbles.
 *
 * A check runs on each input, change or reset, and again a tick later. The first keeps the button in step with
 * typing, so Enter pressed straight after the last key still submits. The second catches what React writes after the
 * event: the form's listener fires before React's root handler, so a controlled value or a custom validity set in an
 * onChange only reaches the DOM afterwards.
 */
export function useFormComplete(control: RefObject<HTMLButtonElement | null>, enabled: boolean = true): boolean {
  const subscribe = useCallback(
    (notify: () => void): (() => void) => {
      const form = control.current?.form;
      if (!enabled || form === null || form === undefined) return () => undefined;
      let timer: number | undefined;
      const later = (): void => {
        notify();
        window.clearTimeout(timer);
        timer = window.setTimeout(notify, 0);
      };
      form.addEventListener("input", later);
      form.addEventListener("change", later);
      form.addEventListener("reset", later);
      // A field added, removed, or made required later (a section that opens) changes what the form needs.
      const observer = new MutationObserver(later);
      observer.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
      return () => {
        window.clearTimeout(timer);
        form.removeEventListener("input", later);
        form.removeEventListener("change", later);
        form.removeEventListener("reset", later);
        observer.disconnect();
      };
    },
    [control, enabled],
  );

  const getSnapshot = (): boolean => {
    const form = control.current?.form;
    return !enabled || form === null || form === undefined ? true : form.checkValidity();
  };

  // Until hydration the button stays enabled, so a form still works before (or without) JavaScript; the server checks.
  return useSyncExternalStore(subscribe, getSnapshot, alwaysComplete);
}

type GatedSubmitButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type" | "children"> & {
  readonly children: ReactNode;
  /** Shown in place of the label while a form action runs. */
  readonly pendingLabel?: ReactNode;
};

/**
 * A submit button, styled by its caller, that stays disabled until its form is complete and while the form's action
 * runs. A button marked `formNoValidate` (a Delete or Skip beside the main one) is never held back by the fields.
 * `disabled` adds the caller's own reasons, such as an onSubmit transition that `useFormStatus` cannot see.
 */
export function GatedSubmitButton({
  children,
  pendingLabel,
  disabled = false,
  formNoValidate = false,
  ...rest
}: GatedSubmitButtonProps): ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const complete = useFormComplete(ref, !formNoValidate);
  return (
    <button
      {...rest}
      ref={ref}
      type="submit"
      formNoValidate={formNoValidate}
      disabled={disabled || pending || !complete}
      aria-busy={pending || undefined}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
