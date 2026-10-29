import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSmall } from "@/components/console/buttons";
import { FactList } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import type { LabelledValue } from "@/lib/invoice-register-view";
import type { PaymentRowView } from "@/lib/payments-view";

/**
 * The month's payments beside its invoices: how the money lines up (what came in, what still needs an invoice, what only a
 * CA needs to know), then every payment in date order with the invoice it was billed on.
 */
export function PaymentsSection({ label, reconciliation, rows }: { readonly label: string; readonly reconciliation: readonly LabelledValue[]; readonly rows: readonly PaymentRowView[] }): ReactElement {
  return (
    <div>
      <FactList items={reconciliation} />
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">No payments in {label}.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table aria-label={`Payments in ${label}`} className={`${TABLE} min-w-[52rem]`}>
            <thead>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Client</th>
                <th className={TH}>For</th>
                <th className={TH}>Method</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={TH}>Status</th>
                <th className={TH}>Invoice</th>
                <th className={TH}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={TD_TIME}>{row.when}</td>
                  <td className={`${TD} font-semibold`}>{row.client}</td>
                  <td className={TD}>{row.forLabel}</td>
                  <td className={`${TD} text-ink-2`}>{row.method}</td>
                  <td className={TD_NUM}>{row.amount}</td>
                  <td className={TD}>
                    <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
                  </td>
                  <td className={`${TD} font-figure text-xs`}>{row.invoice}</td>
                  <td className={`${TD} text-right`}>
                    <Link href={row.href} className={buttonSmall}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
