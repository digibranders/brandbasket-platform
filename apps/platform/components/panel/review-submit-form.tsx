"use client";

import type { ReactElement, ReactNode } from "react";
import { useOpeningPayment } from "@/lib/billing/opening-payment";
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
  const opening = useOpeningPayment(controls.isPending, controls.state);
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <StepFormError controls={controls} errorRef={errorRef} />
      <StepSubmit controls={controls} label={opening ? pendingLabel : label} pendingLabel={pendingLabel} disabled={opening}>
        {ready ? null : <p className="text-[0.8125rem] text-ink-2">Finish the steps above first.</p>}
      </StepSubmit>
      {note === undefined ? null : <div className="max-w-xl text-[0.8125rem] leading-relaxed text-ink-2">{note}</div>}
    </form>
  );
}
