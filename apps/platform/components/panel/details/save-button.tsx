"use client";

import { useRef, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@brandbasket/shared/lib/cn";
import { useFormComplete } from "@brandbasket/shared/ui/forms/submit-gate";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { useFormChanged } from "./use-form-changed";

interface SaveButtonProps {
  readonly label: string;
  /** Shown while the action runs. */
  readonly pendingLabel: string;
  /**
   * What the form was drawn from. With it, the button is only enabled once something is different (and goes back to
   * disabled after a save); without it, a form that adds a row is enabled as soon as it is complete.
   */
  readonly startKey?: string;
}

/**
 * The form's submit button. Dark and clearly pressable when there is something to send; a soft, dimmed button when
 * there is not (nothing changed, or a required field is empty) or while it is sending.
 */
export function SaveButton({ label, pendingLabel, startKey }: SaveButtonProps): ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const complete = useFormComplete(ref);
  const changed = useFormChanged(ref, startKey ?? "");
  const ready = complete && (startKey === undefined || changed) && !pending;
  return (
    <button
      ref={ref}
      type="submit"
      disabled={!ready}
      aria-busy={pending}
      className={cn(ready ? DARK_BUTTON : `${SOFT_BUTTON} h-11 px-5 text-sm`, "disabled:cursor-not-allowed", !ready && "opacity-60")}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
