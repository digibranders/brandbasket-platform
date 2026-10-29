import Link from "next/link";
import type { ReactElement } from "react";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { LedgerRow } from "@/lib/checkout-ledger";
import type { OrderSummary } from "@/lib/membership";

const TONE: Readonly<Record<LedgerRow["tone"], string>> = { plain: "", free: "font-semibold text-ok", save: "font-semibold text-ok" };

/**
 * The services already chosen, with the price the checkout will take: the same rows and figures as the checkout's summary
 * (lib/checkout-ledger.ts), so nothing here is worked out twice. "Chosen by you" is the point: this is not a suggestion.
 */
export function IntakeAside({
  rows,
  summary,
  currency,
  gstBasisPoints,
  changeHref,
}: {
  readonly rows: readonly LedgerRow[];
  readonly summary: OrderSummary;
  readonly currency: MoneyCurrency;
  readonly gstBasisPoints: number;
  /** Where "Change services" goes, or null on the summary, which has the controls itself. */
  readonly changeHref: string | null;
}): ReactElement {
  return (
    <aside aria-label="Your services" className="grid content-start gap-4 rounded-lift bg-surface p-6 shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Your services</h2>
        <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.8125rem] font-semibold text-ink-2">Chosen by you</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.key} className="flex justify-between gap-4 py-2.5 text-[0.9375rem] text-ink-2">
            <span className={row.tone === "save" ? TONE.save : ""}>{row.label}</span>
            <span className={`${row.tone === "free" ? "" : "font-figure tabular-nums"} ${TONE[row.tone]}`}>{row.amount}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-4 py-3">
          <span className="font-display text-base font-semibold text-ink">Due today</span>
          <span className="font-figure text-2xl font-medium tabular-nums text-ink">{formatMoney(summary.totalCents, currency)}</span>
        </li>
      </ul>
      {gstBasisPoints > 0 ? <p className="text-[0.8125rem] text-ink-3">GST is included in every price.</p> : null}
      {summary.adCredit === null ? null : <p className="text-[0.9375rem] font-semibold text-ok">{summary.adCredit.label}</p>}
      {changeHref === null ? null : (
        <Link href={changeHref} className="text-[0.9375rem] font-semibold text-ink underline decoration-line underline-offset-4">
          Change services
        </Link>
      )}
    </aside>
  );
}
