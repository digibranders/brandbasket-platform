"use client";

import { useId, type ReactElement } from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { keepPlan } from "@/app/app-host/restore-account/actions";
import { ConfirmPaymentDialog } from "@/components/panel/confirm-payment";
import { PaymentConfirmButton, usePaymentForm } from "@/components/panel/payment-form";
import type { PaymentSummary } from "@/lib/billing/payment-summary";

/** Keep my plan: shows what the plan goes on costing and when the first payment falls, then opens the payment window for a new mandate. */
export function KeepPlanButton({ summary }: { readonly summary: PaymentSummary }): ReactElement {
  const formId = useId();
  const { action, confirm, opening } = usePaymentForm(keepPlan);
  return (
    <form id={formId} action={action}>
      <Button type="button" variant="secondary" onClick={confirm.ask} disabled={opening} aria-busy={opening}>
        {opening ? "Opening…" : "Keep my plan"}
      </Button>
      <ConfirmPaymentDialog
        summary={summary}
        open={confirm.open}
        onClose={confirm.close}
        busy={opening}
        confirm={<PaymentConfirmButton formId={formId} opening={opening} label="Keep my plan" />}
      />
    </form>
  );
}
