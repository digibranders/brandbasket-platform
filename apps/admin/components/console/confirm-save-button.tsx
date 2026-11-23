"use client";

import { useId, useRef, type ReactElement } from "react";
import { GatedSubmitButton, useFormComplete } from "@brandbasket/shared/ui/forms/submit-gate";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";

interface ConfirmSaveButtonProps {
  /** The dialog title, naming what is saved. */
  readonly title: string;
  /** What changes, in plain words, for the people it affects. */
  readonly consequence: string;
  readonly triggerLabel: string;
  readonly confirmLabel: string;
}

/**
 * The Save button of a form whose change reaches customers: it asks first, and sends the form it sits in only when confirmed.
 * Place it inside the `<form>`. The first button stays disabled until the form's fields are valid, like a gated submit.
 */
export function ConfirmSaveButton({ title, consequence, triggerLabel, confirmLabel }: ConfirmSaveButtonProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const complete = useFormComplete(triggerRef);
  const titleId = useId();
  const descId = useId();
  return (
    <>
      <button ref={triggerRef} type="button" disabled={!complete} onClick={() => dialogRef.current?.showModal()} className={buttonPrimary}>
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[520px] overflow-y-auto rounded-[20px] border border-line bg-surface p-7 text-ink shadow-dialog backdrop:bg-ink/40"
      >
        <div className="grid gap-2.5">
          <h2 id={titleId} className="font-display text-[22px] font-semibold leading-7 text-ink">
            {title}
          </h2>
          <p id={descId} className="text-[0.9375rem] leading-relaxed text-ink-2">
            {consequence}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={() => dialogRef.current?.close()} className={buttonSecondary}>
            Keep
          </button>
          <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving...">
            {confirmLabel}
          </GatedSubmitButton>
        </div>
      </dialog>
    </>
  );
}
