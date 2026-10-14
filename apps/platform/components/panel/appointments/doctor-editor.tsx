"use client";

import type { ClosureRow } from "@firstfold/db";
import { useState, type ReactElement } from "react";
import { PRACTITIONER_NAME_MAX_LENGTH, PRACTITIONER_TITLE_MAX_LENGTH } from "@firstfold/shared/lib/appointments/practitioner-form";
import type { OpeningHours } from "@firstfold/shared/lib/onboarding/hours";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { ClosuresPanel } from "@/components/panel/details/closures-panel";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { HoursEditor } from "@/components/panel/hours-editor";
import type { DoctorSummary } from "./doctors-list";

interface DoctorEditorProps {
  readonly doctor: DoctorSummary;
  /** The doctor's own weekly hours -- or, while they are on clinic hours, the clinic's, so choosing "Own hours"
   * starts from the week the clinic already keeps rather than from a blank one. */
  readonly hours: readonly OpeningHours[];
  /** Upcoming leave only, soonest first. */
  readonly leave: readonly ClosureRow[];
  /** Today's date where the business is (YYYY-MM-DD) -- the earliest day the leave form accepts. */
  readonly today: string;
  readonly updateAction: PanelFormAction;
  readonly scheduleAction: PanelFormAction;
  readonly addLeaveAction: PanelFormAction;
  readonly removeLeaveAction: PanelFormAction;
}

function DetailsForm({ doctor, action }: { readonly doctor: DoctorSummary; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="practitionerId" value={doctor.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`doctor-name-${doctor.id}`} className="block text-sm font-medium">
            Name <RequiredMark />
          </label>
          <RuleInput
            rule="personName"
            id={`doctor-name-${doctor.id}`}
            name="name"
            required
            autoComplete="off"
            maxLength={PRACTITIONER_NAME_MAX_LENGTH}
            defaultValue={controls.valueOf("name", doctor.name)}
            className={FIELD_CLASSES}
            {...controls.fieldStatus("name")}
          />
        </div>
        <div>
          <label htmlFor={`doctor-title-${doctor.id}`} className="block text-sm font-medium">
            Title <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id={`doctor-title-${doctor.id}`}
            name="title"
            type="text"
            autoComplete="off"
            maxLength={PRACTITIONER_TITLE_MAX_LENGTH}
            defaultValue={controls.valueOf("title", doctor.title ?? "")}
            className={FIELD_CLASSES}
            {...controls.fieldStatus("title")}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <SubmitButton
          size="sm"
          disabled={controls.isPending}
          pendingLabel="Saving…"
          aria-label={`Save name and title for ${doctor.name}`}
        >
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}

type ScheduleChoice = "clinic" | "own";

const SCHEDULE_OPTIONS: readonly { readonly value: ScheduleChoice; readonly label: string }[] = [
  { value: "clinic", label: "Clinic hours" },
  { value: "own", label: "Own hours" },
];

/**
 * Clinic hours or the doctor's own week, with the very same editor Your details uses for the clinic's hours. The
 * editor stays mounted while "Clinic hours" is chosen, only hidden and disabled -- a disabled fieldset sends
 * nothing and skips its `required` times, so switching back and forth keeps whatever was typed.
 */
function ScheduleForm({
  doctor,
  hours,
  action,
}: {
  readonly doctor: DoctorSummary;
  readonly hours: readonly OpeningHours[];
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [choice, setChoice] = useState<ScheduleChoice>(doctor.usesClinicHours ? "clinic" : "own");

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="practitionerId" value={doctor.id} />
      <fieldset>
        <legend className="panel-section">
          Hours <RequiredMark />
        </legend>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {SCHEDULE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="schedule"
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                required
                className="accent-accent"
                {...controls.fieldStatus("schedule")}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={choice !== "own"} hidden={choice !== "own"}>
        <legend className="sr-only">Own hours for {doctor.name}</legend>
        <HoursEditor initial={hours} invalidField={controls.invalidField} errorId={controls.errorId} bare />
      </fieldset>

      <div className="flex items-center gap-4">
        <SubmitButton
          size="sm"
          disabled={controls.isPending}
          pendingLabel="Saving…"
          aria-label={`Save hours for ${doctor.name}`}
        >
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}

/** One doctor opened for editing: their name and title, their hours, then their leave -- the leave list and form
 * being Your details' own closures panel, pointed at this doctor. */
export function DoctorEditor({
  doctor,
  hours,
  leave,
  today,
  updateAction,
  scheduleAction,
  addLeaveAction,
  removeLeaveAction,
}: DoctorEditorProps): ReactElement {
  return (
    <div className="space-y-10 pb-4">
      <DetailsForm doctor={doctor} action={updateAction} />

      <div className="border-t border-line pt-8">
        <ScheduleForm doctor={doctor} hours={hours} action={scheduleAction} />
      </div>

      <div className="border-t border-line pt-8">
        <ClosuresPanel
          closures={leave}
          today={today}
          addAction={addLeaveAction}
          deleteAction={removeLeaveAction}
          heading="Leave"
          itemNoun="leave"
          idField="leaveId"
          idPrefix={`leave-${doctor.id}`}
          notePlaceholder="Conference"
          addFields={{ practitionerId: doctor.id }}
        />
      </div>
    </div>
  );
}
