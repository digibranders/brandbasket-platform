"use client";

import { useActionState, type ReactElement } from "react";
import { DARK_BUTTON } from "@/components/v2/classes";
import { useOpeningPayment } from "@/lib/billing/opening-payment";
import { useConfirmPayment } from "./confirm-payment";

interface PaymentForm {
  /** The form's action: runs `run` and holds the screen's buttons until it has answered. */
  readonly action: (formData: FormData) => void;
  readonly confirm: { readonly open: boolean; readonly ask: () => void; readonly close: () => void };
  /** True from the press that pays until the payment has opened, so a double press opens one payment. */
  readonly opening: boolean;
}

/**
 * The state of a payment button whose server action redirects, to the provider's page or back with a notice. A refusal
 * redirects the page to itself, which ends the dialog with it, so the notice shows where it did before; a payment that opens
 * leaves the page with the dialog still open and its button held. An action that returns without a redirect releases both.
 */
export function usePaymentForm(run: (formData: FormData) => Promise<void>): PaymentForm {
  const [settled, action, pending] = useActionState(async (_previous: object | null, formData: FormData): Promise<object> => {
    await run(formData);
    return {};
  }, null);
  const confirm = useConfirmPayment(settled, pending);
  const opening = useOpeningPayment(pending, settled);
  return { action, confirm, opening };
}

/** The dialog's button that pays: it submits the payment's form (`form={formId}`). */
export function PaymentConfirmButton({ formId, opening, label }: { readonly formId: string; readonly opening: boolean; readonly label: string }): ReactElement {
  return (
    <button type="submit" form={formId} disabled={opening} aria-busy={opening} className={DARK_BUTTON}>
      {opening ? "Opening payment…" : label}
    </button>
  );
}
