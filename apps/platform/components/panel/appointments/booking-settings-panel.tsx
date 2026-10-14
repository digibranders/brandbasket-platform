"use client";

import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import type { AppointmentSettingsRow } from "@firstfold/db";
import { PAUSED_MESSAGE_MAX_LENGTH } from "@firstfold/shared/lib/appointments/settings-form";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface BookingSettingsPanelProps {
  /** Null only when the module was switched on but the settings row hasn't been read back yet -- accepting
   * defaults true and the paused message empty, same as a freshly seeded row. */
  readonly settings: Pick<AppointmentSettingsRow, "accepting" | "pausedMessage"> | null;
  readonly action: PanelFormAction;
}

/** Whether the clinic is taking online bookings right now, and what patients see on the week grid while paused. */
export function BookingSettingsPanel({ settings, action }: BookingSettingsPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const checkboxRef: RefObject<HTMLInputElement | null> = useRef(null);

  // Initialised from the saved settings and, from here on, owned entirely by the checkbox's own onChange -- never
  // reset from the form action's result. A failed save never actually clears the toggle (only the DOM's own
  // native reset threatens to, which the effect below guards against), so there is nothing to echo back: this
  // state is already exactly what was submitted, whether that submit succeeded or not.
  const [accepting, setAccepting] = useState(settings?.accepting ?? true);

  // React resets every uncontrolled field once the bound action settles (see lib/panel-form-state.ts's doc
  // comment), and a native reset restores a checkbox from its `defaultChecked` DOM property, which React's
  // `checked` prop never touches once mounted. Without this, a refused save (a pausedMessage over the limit, say)
  // would silently flip "Accepting online booking" back to whatever it was on page load, discarding the toggle in
  // the same submit -- see slot-settings-panel.tsx for the same problem on its dropdowns.
  useEffect(() => {
    const checkbox = checkboxRef.current;
    if (checkbox !== null) checkbox.defaultChecked = accepting;
  }, [accepting]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <label className="flex items-center gap-3">
        <input
          ref={checkboxRef}
          type="checkbox"
          name="accepting"
          checked={accepting}
          onChange={(event) => setAccepting(event.target.checked)}
          className="size-4 shrink-0 accent-accent"
        />
        <span className="text-sm font-medium">Accepting online booking</span>
      </label>

      <div>
        <label htmlFor="appointments-paused-message" className="block text-sm font-medium">
          Message while paused <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input
          id="appointments-paused-message"
          name="pausedMessage"
          type="text"
          defaultValue={controls.valueOf("pausedMessage", settings?.pausedMessage ?? "")}
          maxLength={PAUSED_MESSAGE_MAX_LENGTH}
          placeholder="Online booking is paused. Please call us."
          className={FIELD_CLASSES}
          {...controls.fieldStatus("pausedMessage")}
        />
      </div>

      <div className="flex items-center gap-4">
        <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Saving…">
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
