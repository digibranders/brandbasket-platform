"use client";

import type { ReactElement } from "react";
import type { AppointmentServiceRow } from "@fynix/db";
import { SERVICE_NAME_MAX_LENGTH } from "@fynix/shared/lib/appointments/settings-form";
import { cn } from "@fynix/shared/lib/cn";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { Button } from "@fynix/shared/ui/panel/button";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface ServicesPanelProps {
  /** Unarchived and archived both, oldest position first -- the same order the booking form itself offers them
   * in, archived ones just no longer live there. */
  readonly services: readonly AppointmentServiceRow[];
  readonly addAction: PanelFormAction;
  readonly renameAction: PanelFormAction;
  readonly archiveAction: PanelFormAction;
}

function AddServiceForm({ addAction }: { readonly addAction: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(addAction);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="new-service-name" className="block text-sm font-medium">
          Add a service <RequiredMark />
        </label>
        <input
          id="new-service-name"
          name="name"
          type="text"
          required
          maxLength={SERVICE_NAME_MAX_LENGTH}
          placeholder="Cleaning"
          defaultValue={controls.valueOf("name", "")}
          className={FIELD_CLASSES}
          {...controls.fieldStatus("name")}
        />
      </div>
      <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Adding…">
        Add
      </SubmitButton>
      <PanelFormStatus controls={controls} statusRef={statusRef} />
    </form>
  );
}

/**
 * One service: its name as an editable field, and Archive or Restore. An archived service says "Archived" in words
 * and shows its name in a filled, quieter field. The whole row used to be faded to 55%, which took the Restore
 * button and the name below 4.5:1 and left the state to be read from the fade alone.
 */
function ServiceRow({
  service,
  renameAction,
  archiveAction,
}: {
  readonly service: AppointmentServiceRow;
  readonly renameAction: PanelFormAction;
  readonly archiveAction: PanelFormAction;
}): ReactElement {
  const { formRef: renameFormRef, statusRef: renameStatusRef, formAction: renameFormAction, controls: renameControls } =
    usePanelForm(renameAction);
  const { formRef: archiveFormRef, statusRef: archiveStatusRef, formAction: archiveFormAction, controls: archiveControls } =
    usePanelForm(archiveAction);
  const archived = service.archivedAt !== null;

  return (
    <li className="flex flex-wrap items-end justify-between gap-3 py-3">
      <form ref={renameFormRef} action={renameFormAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="serviceId" value={service.id} />
        <div>
          <label htmlFor={`service-name-${service.id}`} className="sr-only">
            Service name
          </label>
          <input
            id={`service-name-${service.id}`}
            name="name"
            type="text"
            required
            defaultValue={renameControls.valueOf("name", service.name)}
            maxLength={SERVICE_NAME_MAX_LENGTH}
            disabled={archived}
            aria-label={`Service name for ${service.name}`}
            className={cn(FIELD_CLASSES, "disabled:border-transparent disabled:bg-paper-deep disabled:text-ink-soft")}
            {...renameControls.fieldStatus("name")}
          />
        </div>
        {archived ? (
          <span className="pb-2.5 text-[0.8125rem] font-medium text-ink-soft">Archived</span>
        ) : (
          <SubmitButton
            variant="secondary"
            size="sm"
            disabled={renameControls.isPending}
            pendingLabel="Saving…"
            aria-label={`Save name for ${service.name}`}
          >
            Save
          </SubmitButton>
        )}
        <PanelFormStatus controls={renameControls} statusRef={renameStatusRef} />
      </form>

      <form ref={archiveFormRef} action={archiveFormAction} className="flex items-center gap-3">
        <input type="hidden" name="serviceId" value={service.id} />
        <input type="hidden" name="archived" value={archived ? "false" : "true"} />
        <Button
          type="submit"
          variant="quiet"
          size="sm"
          disabled={archiveControls.isPending}
          aria-busy={archiveControls.isPending}
          aria-label={`${archived ? "Restore" : "Archive"} ${service.name}`}
        >
          {archiveControls.isPending ? "Saving…" : archived ? "Restore" : "Archive"}
        </Button>
        <PanelFormStatus controls={archiveControls} statusRef={archiveStatusRef} />
      </form>
    </li>
  );
}

/** The services offered on the booking form: add one, rename any, and archive one no longer offered without
 * losing what it says on bookings already made against it. */
export function ServicesPanel({ services, addAction, renameAction, archiveAction }: ServicesPanelProps): ReactElement {
  return (
    <div className="space-y-6">
      <AddServiceForm addAction={addAction} />

      {services.length === 0 ? (
        <p className="text-sm text-ink-soft">No services yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} renameAction={renameAction} archiveAction={archiveAction} />
          ))}
        </ul>
      )}
    </div>
  );
}
