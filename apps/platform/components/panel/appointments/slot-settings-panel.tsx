"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import type { AppointmentSettingsRow } from "@brandbasket/db";
import { HORIZON_DAYS_OPTIONS, MIN_NOTICE_MINUTES_OPTIONS, type HorizonDays, type MinNoticeMinutes } from "@brandbasket/shared/lib/appointments/settings-form";
import { SLOT_MINUTE_OPTIONS } from "@brandbasket/shared/lib/appointments/slots";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { SelectField } from "@brandbasket/shared/ui/select-field";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface SlotSettingsPanelProps {
  /** Null only when the module was switched on but the settings row hasn't been read back yet -- see
   * BookingSettingsPanel's own note on the same case. Falls back to the column defaults (packages/db/migrations). */
  readonly settings: Pick<AppointmentSettingsRow, "slotMinutes" | "minNoticeMinutes" | "horizonDays"> | null;
  readonly action: PanelFormAction;
}

const MIN_NOTICE_LABELS: Readonly<Record<MinNoticeMinutes, string>> = {
  0: "None",
  60: "1 hour",
  120: "2 hours",
  240: "4 hours",
  1440: "1 day",
};

const HORIZON_LABELS: Readonly<Record<HorizonDays, string>> = {
  7: "1 week",
  14: "2 weeks",
  28: "4 weeks",
  56: "8 weeks",
};

/** FIELD_CLASSES' look for a dropdown's trigger, which is a flex button: `block` would fight its `flex`, and the top
 * margin sits on the wrapper instead. */
const SELECT_TRIGGER_CLASSES =
  "w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent aria-[invalid=true]:border-accent-deep";

/** How far ahead patients can book, how long each slot is, and how much notice a booking needs -- the settings the
 * week grid itself (both here and on the client site) is built from. */
export function SlotSettingsPanel({ settings, action }: SlotSettingsPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  // Initialised from the saved settings and, from here on, owned entirely by each dropdown's own onChange -- never
  // reset from the form action's result. React resets every uncontrolled field once the bound action settles (see
  // lib/panel-form-state.ts's doc comment), which would snap an uncontrolled dropdown back to whatever was chosen on
  // page load right after every submit, success or failure. A controlled dropdown ignores that reset, and a failed
  // save never clears what the customer chose, so this state is already exactly what was submitted.
  const [slotMinutes, setSlotMinutes] = useState(String(settings?.slotMinutes ?? 30));
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(String(settings?.minNoticeMinutes ?? 60));
  const [horizonDays, setHorizonDays] = useState(String(settings?.horizonDays ?? 28));

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="appointments-slot-minutes" className="block text-sm font-medium">
            Slot length <RequiredMark />
          </label>
          <SelectField
            id="appointments-slot-minutes"
            name="slotMinutes"
            value={slotMinutes}
            onChange={setSlotMinutes}
            options={SLOT_MINUTE_OPTIONS.map((minutes) => ({ value: String(minutes), label: `${String(minutes)} min` }))}
            required
            className={SELECT_TRIGGER_CLASSES}
            wrapperClassName="mt-1.5"
            {...controls.fieldStatus("slotMinutes")}
          />
        </div>

        <div>
          <label htmlFor="appointments-min-notice" className="block text-sm font-medium">
            Minimum notice <RequiredMark />
          </label>
          <SelectField
            id="appointments-min-notice"
            name="minNoticeMinutes"
            value={minNoticeMinutes}
            onChange={setMinNoticeMinutes}
            options={MIN_NOTICE_MINUTES_OPTIONS.map((minutes) => ({ value: String(minutes), label: MIN_NOTICE_LABELS[minutes] }))}
            required
            className={SELECT_TRIGGER_CLASSES}
            wrapperClassName="mt-1.5"
            {...controls.fieldStatus("minNoticeMinutes")}
          />
        </div>

        <div>
          <label htmlFor="appointments-horizon-days" className="block text-sm font-medium">
            Booking window <RequiredMark />
          </label>
          <SelectField
            id="appointments-horizon-days"
            name="horizonDays"
            value={horizonDays}
            onChange={setHorizonDays}
            options={HORIZON_DAYS_OPTIONS.map((days) => ({ value: String(days), label: HORIZON_LABELS[days] }))}
            required
            className={SELECT_TRIGGER_CLASSES}
            wrapperClassName="mt-1.5"
            {...controls.fieldStatus("horizonDays")}
          />
        </div>
      </div>

      <Link href="/details" className="link-underline inline-block text-sm text-ink-soft">
        Hours and holidays →
      </Link>

      <div className="flex items-center gap-4">
        <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Saving…">
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
