import type { ReactElement, ReactNode } from "react";
import { Notice } from "@/components/console/notice";
import { TABLE, TD, TD_NUM, TH } from "@/components/console/table";
import type { DocumentSeriesView, GstSummaryView, LabelledValue } from "@/lib/invoice-register-view";

const NUM_HEAD = `${TH} text-right`;

function Part({ title, note, children }: { readonly title: string; readonly note: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-2">{note}</p>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </div>
  );
}

/**
 * What a CA types into the two returns, worked out from the month's invoices: GSTR-3B's outward supplies, GSTR-1's
 * B2B count, B2C by place of supply and rate, the SAC summary, and the series of documents issued. Every figure is a sum
 * of invoice lines and is checked against the invoice headers: when they differ the page says which invoice.
 */
export function GstSummary({
  summary,
  b2b,
  series,
}: {
  readonly summary: GstSummaryView;
  /** "2 invoices, ₹0.00 taxable, ₹0.00 tax" for customers with a GSTIN. */
  readonly b2b: LabelledValue;
  readonly series: readonly DocumentSeriesView[];
}): ReactElement {
  return (
    <div>
      {summary.mismatches.length === 0 ? null : (
        <Notice tone="problem" className="mb-5">
          The lines of {summary.mismatches.join(", ")} do not add up to the invoice totals. Check these before filing.
        </Notice>
      )}

      <Part title="Outward taxable supplies" note="GSTR-3B, table 3.1(a). Supplies to unregistered and registered customers together.">
        <table aria-label="Outward taxable supplies" className={`${TABLE} min-w-[32rem]`}>
          <thead>
            <tr>
              {summary.outward.map((item) => (
                <th key={item.label} className={NUM_HEAD}>
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {summary.outward.map((item) => (
                <td key={item.label} className={TD_NUM}>
                  {item.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Part>

      <Part title="Registered customers" note="GSTR-1, table 4. Each invoice with a GSTIN is a line in the register below.">
        <p className="text-sm tabular-nums">{b2b.value}</p>
      </Part>

      <Part title="Customers without a GSTIN" note="GSTR-1, table 7. By place of supply and rate.">
        {summary.b2c.length === 0 ? (
          <p className="text-sm text-ink-2">None this month.</p>
        ) : (
          <table aria-label="Unregistered customers by place of supply" className={`${TABLE} min-w-[40rem]`}>
            <thead>
              <tr>
                <th className={TH}>Place of supply</th>
                <th className={NUM_HEAD}>Rate</th>
                <th className={NUM_HEAD}>Taxable value</th>
                <th className={NUM_HEAD}>CGST</th>
                <th className={NUM_HEAD}>SGST</th>
                <th className={NUM_HEAD}>IGST</th>
              </tr>
            </thead>
            <tbody>
              {summary.b2c.map((row) => (
                <tr key={row.key}>
                  <td className={TD}>{row.place}</td>
                  <td className={TD_NUM}>{row.rate}</td>
                  <td className={TD_NUM}>{row.taxable}</td>
                  <td className={TD_NUM}>{row.cgst}</td>
                  <td className={TD_NUM}>{row.sgst}</td>
                  <td className={TD_NUM}>{row.igst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>

      <Part title="Services by SAC" note="GSTR-1, table 12. The unit is not applicable for a service.">
        {summary.hsn.length === 0 ? (
          <p className="text-sm text-ink-2">None this month.</p>
        ) : (
          <table aria-label="Services by SAC" className={`${TABLE} min-w-[48rem]`}>
            <thead>
              <tr>
                <th className={TH}>SAC</th>
                <th className={TH}>Description</th>
                <th className={NUM_HEAD}>Quantity</th>
                <th className={NUM_HEAD}>Taxable value</th>
                <th className={NUM_HEAD}>CGST</th>
                <th className={NUM_HEAD}>SGST</th>
                <th className={NUM_HEAD}>IGST</th>
                <th className={NUM_HEAD}>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.hsn.map((row) => (
                <tr key={row.key}>
                  <td className={`${TD} font-figure tabular-nums`}>{row.sac}</td>
                  <td className={TD}>{row.description}</td>
                  <td className={TD_NUM}>{row.quantity}</td>
                  <td className={TD_NUM}>{row.taxable}</td>
                  <td className={TD_NUM}>{row.cgst}</td>
                  <td className={TD_NUM}>{row.sgst}</td>
                  <td className={TD_NUM}>{row.igst}</td>
                  <td className={TD_NUM}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>

      <Part title="Invoices issued" note="GSTR-1, table 13. Invoices are never edited or deleted, so none are cancelled.">
        {series.length === 0 ? (
          <p className="text-sm text-ink-2">None this month.</p>
        ) : (
          <ul className="grid gap-2 text-sm tabular-nums">
            {series.map((entry) => (
              <li key={entry.key}>
                <span className="font-semibold">{entry.range}</span>, {entry.detail}
                {entry.gaps === null ? null : <span className="mt-1 block font-semibold text-error">{entry.gaps}</span>}
              </li>
            ))}
          </ul>
        )}
      </Part>
    </div>
  );
}
