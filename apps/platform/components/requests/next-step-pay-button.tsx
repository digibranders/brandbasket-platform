"use client";

import { useId, type ReactElement } from "react";
import { ConfirmPaymentDialog } from "@/components/panel/confirm-payment";
import { PaymentConfirmButton, usePaymentForm } from "@/components/panel/payment-form";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { PaymentSummary } from "@/lib/billing/payment-summary";

interface NextStepPayButtonProps {
  /** The server action that accepts the quote or pays its charge. */
  readonly action: (formData: FormData) => Promise<void>;
  /** The hidden fields it reads: only ids, as the business comes from the session. */
  readonly fields: readonly { readonly name: string; readonly value: string }[];
  readonly label: string;
  readonly summary: PaymentSummary;
}

/** A request's accept or pay button: it shows what is paid, and the dialog's button sends the form. */
export function NextStepPayButton({ action: run, fields, label, summary }: NextStepPayButtonProps): ReactElement {
  const formId = useId();
  const { action, confirm, opening } = usePaymentForm(run);
  return (
    <form id={formId} action={action}>
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <button type="button" onClick={confirm.ask} disabled={opening} aria-busy={opening} className={DARK_BUTTON}>
        {label}
      </button>
      <ConfirmPaymentDialog
        summary={summary}
        open={confirm.open}
        onClose={confirm.close}
        busy={opening}
        confirm={<PaymentConfirmButton formId={formId} opening={opening} label={`Pay ${summary.total}`} />}
      />
    </form>
  );
}
