"use client";

import { DataTable, type DataTableColumn } from "@/components";
import { formatDate, formatQuantity } from "@/lib/format";

export interface ReportRow {
  readonly key: string;
  readonly title: string;
  readonly href: string;
  readonly highlights: string | null;
  readonly sentAt: Date;
}

const COLUMNS: readonly DataTableColumn<ReportRow>[] = [
  { key: "month", header: "Month", cell: (row) => row.title },
  { key: "highlights", header: "Highlights", priority: "low", cell: (row) => row.highlights ?? "" },
  { key: "sent", header: "Sent", cell: (row) => formatDate(row.sentAt) },
];

/** The sent reports, one row a month. The month opens its report. */
export function ReportsTable({ rows }: { readonly rows: readonly ReportRow[] }) {
  return (
    <DataTable
      label="Reports"
      rows={rows}
      columns={COLUMNS}
      rowKey={(row) => row.key}
      rowHref={(row) => row.href}
      empty={{ icon: "Tray", title: "No report has been sent yet", description: "Your first one appears here after your first full month." }}
      count={(n) => formatQuantity(n, "report")}
    />
  );
}
