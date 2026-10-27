"use client";

import type { ReactElement } from "react";
import { HoursEditor } from "@/components/panel/hours-editor";
import type { OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { SaveButton } from "./save-button";

interface HoursPanelProps {
  readonly hours: readonly OpeningHours[];
  readonly action: PanelFormAction;
}

/** The week's opening hours, saved on their own, with the same editor onboarding's business step uses. */
export function HoursPanel({ hours, action }: HoursPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <HoursEditor initial={hours} invalidField={controls.invalidField} errorId={controls.errorId} bare />
      <div className="flex items-center gap-4">
        <SaveButton label="Save" pendingLabel="Saving…" startKey={JSON.stringify(hours)} />
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
