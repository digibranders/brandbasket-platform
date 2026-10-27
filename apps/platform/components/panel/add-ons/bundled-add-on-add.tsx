"use client";

import type { ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface BundledAddOnAddProps {
  /** The add-on's catalogue id. Only this goes in the form; the server works out the price again. */
  readonly addOn: string;
  readonly title: string;
  /** What the page says once it has gone through without a payment (keeping one that is ending). */
  readonly savedText: string;
  /** The id of the add-on's heading. Focus goes there when the action has gone through. */
  readonly headingId: string;
  readonly action: PanelFormAction;
}

/**
 * Add for an add-on, with no confirm step: adding sends the customer to the payment page, which shows the amount before
 * anything is taken, and keeping one that is ending takes nothing. When it goes through without a payment the page is redrawn
 * with the add-on included, which removes this control, so focus is placed on the add-on's heading first.
 */
export function BundledAddOnAdd({ addOn, title, savedText, headingId, action }: BundledAddOnAddProps): ReactElement {
  const focusHeadingAfter: PanelFormAction = async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "saved") document.getElementById(headingId)?.focus();
    return next;
  };
  const { formRef, statusRef, formAction, controls } = usePanelForm(focusHeadingAfter);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="addOn" value={addOn} />
      {controls.saved ? null : (
        <button
          type="submit"
          className={`${SOFT_BUTTON} disabled:opacity-55`}
          disabled={controls.isPending}
          aria-busy={controls.isPending}
          aria-label={controls.isPending ? `Adding ${title}` : `Add ${title}`}
        >
          {controls.isPending ? "Adding…" : "Add"}
        </button>
      )}
      <PanelFormStatus controls={controls} statusRef={statusRef} savedText={savedText} />
    </form>
  );
}
