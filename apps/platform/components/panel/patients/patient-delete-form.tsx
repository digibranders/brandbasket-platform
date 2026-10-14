"use client";

import { useState, type ReactElement } from "react";
import { PATIENT_ID_FIELD } from "@firstfold/shared/lib/patients/fields";
import { Button } from "@firstfold/shared/ui/panel/button";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface PatientDeleteFormProps {
  readonly patientId: string;
  readonly name: string;
  /** Erases the patient; on success it navigates to the list, which says so. */
  readonly action: PanelFormAction;
}

/**
 * Delete patient, behind a confirm step like the booking panel's Cancel: the first button only asks. Deleting
 * cannot be undone -- the patient's name and number leave the register and every one of their bookings -- so the
 * question says what goes and what stays. A refusal (an upcoming booking) shows beside the buttons and keeps the
 * question open.
 */
export function PatientDeleteForm({ patientId, name, action }: PatientDeleteFormProps): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Delete patient
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-ink">
        Delete {name}? Their bookings stay, without a name or number.
      </p>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name={PATIENT_ID_FIELD} value={patientId} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={controls.isPending}
          aria-busy={controls.isPending}
          aria-label={`Yes, delete ${name}`}
        >
          {controls.isPending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="quiet" size="sm" disabled={controls.isPending} onClick={() => setConfirming(false)}>
          Keep
        </Button>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </form>
    </div>
  );
}
