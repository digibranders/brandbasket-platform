import type { PaymentNeedingAttention, StaffPaymentRow } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { AttentionItem } from "@/components/payments/money-lanes";
import { PAYMENT_ATTENTION_LABELS } from "@/lib/billing/attention";
import { needsLookOrFailed, paymentOpenHref } from "@/lib/payments-view";

export interface PaymentsAttention {
  readonly items: readonly AttentionItem[];
  /** Payments that need a look, each counted once: the same set the rail counts for the current month. */
  readonly count: number;
}

function titleFor(row: StaffPaymentRow): string {
  if (row.attentionReason !== null && row.attentionResolvedAt === null) return PAYMENT_ATTENTION_LABELS[row.attentionReason].title;
  return row.failureReason === null ? "Payment failed" : `Payment failed: ${row.failureReason}`;
}

/**
 * The month's payments that are flagged or failed, plus payments flagged in other months and still unresolved (these open the
 * client's page, since they are not in this month's list). Each payment appears once.
 */
export function paymentsAttention(month: string, rows: readonly StaffPaymentRow[], flagged: readonly PaymentNeedingAttention[]): PaymentsAttention {
  const inMonth = rows.filter(needsLookOrFailed);
  const seen = new Set(rows.map((row) => row.id));
  const items: AttentionItem[] = inMonth.map((row) => ({
    key: row.id,
    client: row.businessName,
    title: titleFor(row),
    amount: formatMoney(row.amountCents, row.currency),
    href: paymentOpenHref(month, "all", row.id),
  }));
  for (const payment of flagged) {
    if (seen.has(payment.paymentId)) continue;
    items.push({
      key: payment.paymentId,
      client: payment.businessName,
      title: PAYMENT_ATTENTION_LABELS[payment.reason].title,
      amount: formatMoney(payment.amountCents, payment.currency),
      href: `/clients/${payment.businessId}/billing#payment-${payment.paymentId}`,
    });
  }
  return { items, count: items.length };
}
