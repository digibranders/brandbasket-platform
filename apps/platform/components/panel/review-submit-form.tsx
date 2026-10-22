"use client";

import type { ReactElement, ReactNode } from "react";
import { StepFormError, StepSubmit, useStepForm, type StepAction } from "@/components/panel/step-form";

interface ReviewSubmitFormProps {
  readonly action: StepAction;
  /** False while the checklist shows something missing; the server checks again either way. */
  readonly ready: boolean;
  /** The button, e.g. "Pay $75 and send" or "Send it to us". */
  readonly label: string;
  readonly pendingLabel: string;
  /** What pressing it means, shown under the button when there is something to say. */
  readonly note?: ReactNode;
}

/**
 * Step 05's button: pay and send, or just send once paid. Everything it needs is already saved, so it posts nothing
 * but the request itself.
 */
export function ReviewSubmitForm({ action, ready, label, pendingLabel, note }: ReviewSubmitFormProps): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action);
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <StepFormError controls={controls} errorRef={errorRef} />
      <StepSubmit controls={controls} label={label} pendingLabel={pendingLabel}>
        {ready ? null : <p className="text-sm text-ink-soft">Finish the steps above first.</p>}
      </StepSubmit>
      {note === undefined ? null : <div className="max-w-xl text-sm leading-relaxed text-ink-soft">{note}</div>}
    </form>
  );
}
