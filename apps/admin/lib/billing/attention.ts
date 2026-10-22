import type { PaymentAttentionReason } from "@brandbasket/db";

/** What each attention reason means for staff, and what to do about it. */
export const PAYMENT_ATTENTION_LABELS: Readonly<
  Record<PaymentAttentionReason, { readonly title: string; readonly action: string }>
> = {
  checkout_replaced: {
    title: "Paid a checkout we had already replaced",
    action: "Nothing was activated. Refund it at the provider, or apply it by recording a manual payment.",
  },
  already_paid: {
    title: "Duplicate payment",
    action: "They already had access, so nothing was activated. Refund it at the provider.",
  },
  amount_mismatch: {
    title: "Amount isn’t the plan’s first payment",
    action: "Nothing was activated. Check what was taken, then refund it or apply it by recording a manual payment.",
  },
  upgrade_not_applied: {
    title: "Paid for a move up that no longer applied",
    action: "Nothing changed for the client. Refund it at the provider; they can start the upgrade again from their Upgrade page.",
  },
  upgrade_provider_pending: {
    title: "Moved up to Premium, but the provider wasn’t told",
    action: "They have Premium. Use Finish the move on their page to tell the provider to bill Premium from the next renewal.",
  },
  add_on_not_applied: {
    title: "Paid for an add-on that no longer applied",
    action: "Nothing changed for the client: their month had renewed or their plan was ending. Refund it at the provider; they can add it again from Add-ons.",
  },
  add_on_provider_pending: {
    title: "A service change didn’t reach the provider",
    action:
      "A service was added or removed, but the provider wasn’t told the new monthly amount. For an add, the service is on: use Retry on their page, which also moves their other services to the package price from the next renewal. For a removal that still shows, press Remove again.",
  },
  submission_failed: {
    title: "Paid, but sending their answers failed",
    action: "Their plan is active. Check their setup reached us; they can also send it again from Check and send.",
  },
};
