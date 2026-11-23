import type { ReactElement } from "react";
import { TABLE, TD_COMPACT, TD_COMPACT_NUM, TD_COMPACT_TIME, TH } from "@/components/console/table";
import type { RegisterFooterView, RegisterTableRow } from "@/lib/invoice-register-view";
import { TableScroll } from "@/components/console/table-scroll";

const NUM_HEAD = `${TH} text-right`;

/**
 * The month's tax invoice register, every figure a CA files from, one invoice a row: number and date, who and under
 * what GSTIN, the place of supply, taxable value, each tax, round off and total, with the PDF at the end. The foot
 * is the month's sums, the same ones the figures above and the CSV carry.
 */
export function RegisterTable({ label, rows, footer }: { readonly label: string; readonly rows: readonly RegisterTableRow[]; readonly footer: RegisterFooterView }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <TableScroll label={label}>
        <table aria-label={label} className={`${TABLE} min-w-[64rem]`}>
          <thead>
            <tr>
              <th className={TH}>Invoice</th>
              <th className={TH}>Date</th>
              <th className={TH}>Customer</th>
              <th className={TH}>Place of supply</th>
              <th className={NUM_HEAD}>Taxable value</th>
              <th className={NUM_HEAD}>CGST</th>
              <th className={NUM_HEAD}>SGST</th>
              <th className={NUM_HEAD}>IGST</th>
              <th className={NUM_HEAD}>Round off</th>
              <th className={NUM_HEAD}>Total</th>
              <th className={TH}>
                <span className="sr-only">Download</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={`${TD_COMPACT} font-figure font-medium tabular-nums`}>{row.number}</td>
                <td className={TD_COMPACT_TIME}>{row.date}</td>
                <td className={`${TD_COMPACT} max-w-[28rem] truncate`} title={`${row.customer}, ${row.party}. ${row.payment}${row.paid === null ? "" : `, ${row.paid}`}`}>
                  <span className="font-semibold">{row.customer}</span> <span className="text-xs tabular-nums text-ink-2">{row.party}</span>{" "}
                  <span className="text-xs text-ink-2">
                    {row.payment}
                    {row.paid === null ? null : <span className="font-semibold">, {row.paid}</span>}
                  </span>
                </td>
                <td className={`${TD_COMPACT} text-ink-2`}>{row.place}</td>
                <td className={TD_COMPACT_NUM}>{row.taxable}</td>
                <td className={TD_COMPACT_NUM}>{row.cgst}</td>
                <td className={TD_COMPACT_NUM}>{row.sgst}</td>
                <td className={TD_COMPACT_NUM}>{row.igst}</td>
                <td className={TD_COMPACT_NUM}>{row.roundOff}</td>
                <td className={`${TD_COMPACT_NUM} font-semibold`}>{row.total}</td>
                <td className={`${TD_COMPACT} text-right`}>
                  <a href={row.downloadHref} aria-label={row.downloadLabel} className="text-sm font-semibold text-ink underline underline-offset-4">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className={TD_COMPACT} colSpan={4}>
                Month total
              </td>
              <td className={TD_COMPACT_NUM}>{footer.taxable}</td>
              <td className={TD_COMPACT_NUM}>{footer.cgst}</td>
              <td className={TD_COMPACT_NUM}>{footer.sgst}</td>
              <td className={TD_COMPACT_NUM}>{footer.igst}</td>
              <td className={TD_COMPACT_NUM}>{footer.roundOff}</td>
              <td className={TD_COMPACT_NUM}>{footer.total}</td>
              <td className={TD_COMPACT} />
            </tr>
          </tfoot>
        </table>
      </TableScroll>
    </div>
  );
}
