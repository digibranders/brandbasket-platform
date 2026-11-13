"use client";

import type { ReactElement } from "react";
import { saveEnquiryAction } from "@/app/app-host/(protected)/website/enquiries/actions";
import { SaveButton } from "@/components/panel/details/save-button";
import { PanelFormStatus, usePanelForm } from "@/components/panel/form/panel-form";
import { NOTE_MAX, STATUS_FILTER_LABELS, type EnquiryRow } from "@/lib/enquiries/rules";

const FIELD =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-2/80 focus:border-ink aria-[invalid=true]:border-error";
const LABEL = "text-[0.9375rem] font-semibold text-ink";
const STATUSES = ["new", "contacted", "won", "lost"] as const;

/** The status and the private note of one enquiry, saved by a guarded action. Drawn for owners and editors of a paid plan only. */
export function EnquiryForm({ row }: { readonly row: EnquiryRow & { readonly status: (typeof STATUSES)[number] } }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(saveEnquiryAction);
  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={row.id} />
      <div>
        <label htmlFor={`enquiry-status-${row.id}`} className={LABEL}>
          Status
        </label>
        <select id={`enquiry-status-${row.id}`} name="status" defaultValue={controls.valueOf("status", row.status)} className={FIELD}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_FILTER_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`enquiry-note-${row.id}`} className={LABEL}>
          Private note
        </label>
        <textarea
          id={`enquiry-note-${row.id}`}
          name="note"
          rows={4}
          maxLength={NOTE_MAX}
          defaultValue={controls.valueOf("note", row.note ?? "")}
          placeholder="Only you and your team can see this."
          aria-describedby={controls.invalidField === "note" ? controls.errorId : undefined}
          className={FIELD}
          {...controls.fieldStatus("note")}
        />
      </div>
      <div className="flex items-center gap-4">
        <SaveButton label="Save" pendingLabel="Saving…" startKey={JSON.stringify([row.id, row.status, row.note])} />
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
