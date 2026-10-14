"use client";

import type { ReactElement } from "react";
import { HoursEditor } from "@/components/panel/hours-editor";
import type { OpeningHours } from "@firstfold/shared/lib/onboarding/hours";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface HoursPanelProps {
  readonly hours: readonly OpeningHours[];
  readonly action: PanelFormAction;
}

/** The week's opening hours, saved on their own — the same editor onboarding's business step uses. */
export function HoursPanel({ hours, action }: HoursPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <HoursEditor initial={hours} invalidField={controls.invalidField} errorId={controls.errorId} bare />
      <div className="flex items-center gap-4">
        <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Saving…">
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
