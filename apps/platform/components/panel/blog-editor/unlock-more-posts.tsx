"use client";

import { useId, type ReactElement } from "react";
import { unlockBlogPostsAction } from "@/app/app-host/(protected)/content/blog/actions";
import { ConfirmPaymentDialog } from "@/components/panel/confirm-payment";
import { PaymentConfirmButton, usePaymentForm } from "@/components/panel/payment-form";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { PaymentSummary } from "@/lib/billing/payment-summary";

interface UnlockMorePostsProps {
  readonly posts: number;
  readonly price: string;
  readonly summary: PaymentSummary;
}

/** At the post limit: Unlock shows what the next block costs, and the dialog's button opens its payment. */
export function UnlockMorePosts({ posts, price, summary }: UnlockMorePostsProps): ReactElement {
  const formId = useId();
  const { action, confirm, opening } = usePaymentForm(unlockBlogPostsAction);
  return (
    <form id={formId} action={action}>
      <button type="button" onClick={confirm.ask} disabled={opening} aria-busy={opening} className={DARK_BUTTON}>
        {opening ? "Opening payment…" : `Unlock ${posts} more posts · ${price}`}
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
