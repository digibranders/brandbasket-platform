"use client";

import { useActionState, useId } from "react";
import { ConfirmPaymentDialog, useConfirmPayment } from "@/features/checkout/components/confirm-payment";
import type { PaymentSummary } from "@/features/checkout/rules/payment-summary";
import { Button } from "@/ui";
import { keepPlanAction, restoreAccountAction } from "../actions";

/** Restore my account. */
export function RestoreButton() {
  const [, action, pending] = useActionState(restoreAccountAction, null);
  return (
    <form action={action}>
      <Button type="submit" variant="primary" pending={pending}>
        Restore my account
      </Button>
    </form>
  );
}

/** Keep my plan: shows what the plan goes on costing, then opens the payment window for a new mandate. */
export function KeepPlanButton({ summary }: { readonly summary: PaymentSummary }) {
  const formId = useId();
  const [state, action, pending] = useActionState(keepPlanAction, null);
  const confirm = useConfirmPayment(state, pending);
  return (
    <form id={formId} action={action}>
      <Button pending={pending} onClick={confirm.ask}>
        Keep my plan
      </Button>
      <ConfirmPaymentDialog
        summary={summary}
        open={confirm.open}
        onClose={confirm.close}
        confirm={
          <Button type="submit" form={formId} variant="primary" pending={pending}>
            {pending ? "Opening…" : "Keep my plan"}
          </Button>
        }
      />
    </form>
  );
}
