"use client";

import { DataTable, EmptyState, StatusChip, type Column } from "@brandbasket/shared/ui/patterns";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSecondary } from "@/components/console/buttons";

export interface AccessLogRow {
  readonly id: string;
  readonly whenIso: string;
  readonly person: string;
  /** The human name of the action. */
  readonly label: string;
  /** The stored action id, shown in Mono under the label. */
  readonly action: string;
  readonly refused: boolean;
  readonly detail: string | null;
  readonly target: string;
  readonly from: string;
}

/** The access log as a compact read-only register (36px rows). Filters stay in the address, so paging and sharing a link work. */
export function AccessLogTable({ rows }: { readonly rows: readonly AccessLogRow[] }): ReactElement {
  const columns: readonly Column<AccessLogRow>[] = [
    { id: "when", header: "When", cell: (row) => <span className="whitespace-nowrap font-figure text-xs text-ink-2"><LocalDateTime iso={row.whenIso} variant="timestamp" /></span> },
    { id: "person", header: "Person", hideBelow: "sm", cell: (row) => row.person },
    {
      id: "what",
      header: "What",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 truncate">
            {row.label}
            {row.refused ? <StatusChip label="Refused" variant="failed" /> : null}
          </span>
          <span className="truncate font-figure text-xs leading-4 text-ink-3">{row.detail === null ? row.action : `${row.action} ${row.detail}`}</span>
        </span>
      ),
    },
    { id: "target", header: "Target", hideBelow: "sm", cell: (row) => <span className="font-figure text-xs text-ink-2">{row.target}</span> },
    { id: "from", header: "From", hideBelow: "sm", align: "end", cell: (row) => <span className="font-figure text-xs text-ink-2">{row.from}</span> },
  ];
  return (
    <DataTable
      label="Access log"
      density="compact"
      columns={columns}
      rows={rows}
      rowId={(row) => row.id}
      state={rows.length === 0 ? "empty" : "ready"}
      empty={
        <EmptyState
          title="Nothing matches these filters."
          description="Clear the filters to see every record again."
          action={
            <Link href="/access-log" className={buttonSecondary}>
              Clear filters
            </Link>
          }
        />
      }
    />
  );
}
