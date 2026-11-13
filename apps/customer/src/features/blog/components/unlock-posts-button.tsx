"use client";

import { useState, useTransition } from "react";
import { ConfirmPaymentDialog, useConfirmPayment } from "@/features/checkout/components/confirm-payment";
import type { PaymentSummary } from "@/features/checkout/rules/payment-summary";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/ui";
import { unlockPostsAction } from "../actions";

/**
 * At the post limit: shows what the next block costs, then opens its payment (the action redirects to it). Only ever on a
 * press; the price is also stated in the list's footer line.
 */
export function UnlockPostsButton({ summary }: { readonly summary: PaymentSummary }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirmPayment(result, pending);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" pending={pending} onClick={confirm.ask}>
        Unlock more posts
      </Button>
      <ConfirmPaymentDialog
        summary={summary}
        open={confirm.open}
        onClose={confirm.close}
        confirm={
          <Button variant="primary" pending={pending} onClick={() => startTransition(async () => setResult(await unlockPostsAction()))}>
            {`Pay ${summary.total}`}
          </Button>
        }
      />
      {result === null || result.ok ? null : (
        <p role="alert" className="type-meta text-neg-text">
          {result.message}
        </p>
      )}
    </div>
  );
}
