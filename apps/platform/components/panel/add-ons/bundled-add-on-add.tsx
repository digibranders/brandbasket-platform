"use client";

import { useId, type ReactElement } from "react";
import { ConfirmPaymentDialog, useConfirmPayment } from "@/components/panel/confirm-payment";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import type { PaymentSummary } from "@/lib/billing/payment-summary";
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
  /** What adding takes and what follows, shown before anything is sent. Null for keeping one that is ending, which takes nothing. */
  readonly summary: PaymentSummary | null;
}

/**
 * Add for an add-on. Adding that takes money opens the payment's confirmation first (the lines, what is due today and what
 * follows) and sends the form only from its "Pay" button, which goes on to the payment page; keeping one that is ending takes
 * nothing and sends at once. When it goes through without a payment the page is redrawn with the add-on included, which removes
 * this control, so focus is placed on the add-on's heading first.
 */
export function BundledAddOnAdd({ addOn, title, savedText, headingId, action, summary }: BundledAddOnAddProps): ReactElement {
  const formId = useId();
  const focusHeadingAfter: PanelFormAction = async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "saved") document.getElementById(headingId)?.focus();
    return next;
  };
  const { formRef, statusRef, formAction, controls } = usePanelForm(focusHeadingAfter);
  const confirm = useConfirmPayment(controls.state, controls.isPending);

  return (
    <form id={formId} ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="addOn" value={addOn} />
      {controls.saved ? null : (
        <button
          type={summary === null ? "submit" : "button"}
          onClick={summary === null ? undefined : confirm.ask}
          className={`${SOFT_BUTTON} disabled:opacity-55`}
          disabled={controls.isPending}
          aria-busy={controls.isPending}
          aria-label={controls.isPending ? `Adding ${title}` : `Add ${title}`}
        >
          {controls.isPending ? "Adding…" : "Add"}
        </button>
      )}
      <PanelFormStatus controls={controls} statusRef={statusRef} savedText={savedText} />
      {summary === null ? null : (
        <ConfirmPaymentDialog
          summary={summary}
          open={confirm.open}
          onClose={confirm.close}
          busy={controls.isPending}
          confirm={
            <button type="submit" form={formId} className={DARK_BUTTON} disabled={controls.isPending} aria-busy={controls.isPending}>
              {`Pay ${summary.total}`}
            </button>
          }
        />
      )}
    </form>
  );
}
