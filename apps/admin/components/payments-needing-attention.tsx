import type { PaymentNeedingAttention } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { PAYMENT_ATTENTION_LABELS } from "@/lib/billing/attention";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { buttonSecondary } from "@/components/console/buttons";

interface PaymentsNeedingAttentionProps {
  readonly payments: readonly PaymentNeedingAttention[];
  /** Link each row to its client page (the Overview). The client page itself leaves this off. */
  readonly linkToClient: boolean;
  /**
   * When given, each row gets a "Mark as sorted" button posting to this action. Only pass it for admins; the action
   * checks again.
   */
  readonly resolveAction?: (formData: FormData) => Promise<void>;
}

/**
 * Payments staff need to look at: money that arrived but bought nothing, and paid customers whose answers failed to
 * send. Every date is in the reader's own zone, named.
 */
export function PaymentsNeedingAttention({
  payments,
  linkToClient,
  resolveAction,
}: PaymentsNeedingAttentionProps): ReactElement {
  return (
    <ul className="divide-y divide-line [&>li:first-child]:pt-0">
      {payments.map((payment) => {
        const label = PAYMENT_ATTENTION_LABELS[payment.reason];
        return (
          <li key={payment.paymentId} className="flex flex-wrap items-start justify-between gap-4 py-4">
            <span className="min-w-0">
              {linkToClient ? (
                <Link href={`/clients/${payment.businessId}`} className="font-display text-[0.9375rem] font-semibold hover:underline">
                  {payment.businessName}
                </Link>
              ) : null}
              <span className="block font-medium tabular-nums">
                {label.title} · {formatMoney(payment.amountCents, payment.currency)}
              </span>
              <span className="block text-sm text-ink-soft">{label.action}</span>
              <span className="block text-sm tabular-nums text-ink-soft">
                Flagged <LocalDateTime iso={payment.raisedAt.toISOString()} variant="timestamp" /> ·{" "}
                {payment.provider} payment <span className="break-all font-mono text-xs">{payment.providerPaymentId}</span>
              </span>
            </span>
            {resolveAction === undefined ? null : (
              <form action={resolveAction}>
                <input type="hidden" name="businessId" value={payment.businessId} />
                <input type="hidden" name="paymentId" value={payment.paymentId} />
                <button type="submit" className={buttonSecondary}>
                  Mark as sorted
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
