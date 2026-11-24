"use client";

import { DataTable, EmptyState, type Column } from "@brandbasket/shared/ui/patterns";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import type { ReactElement } from "react";
import { extendClosureAction, restoreClosureAction } from "@/app/(protected)/clients/[businessId]/people/actions";
import { buttonSmall } from "@/components/console/buttons";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import type { ClosureRow } from "@/lib/compliance-model";

export interface ClosuresTableProps {
  readonly rows: readonly ClosureRow[];
  /** Restore and Extend are admin actions; without the capability the table only reads. */
  readonly canAct: boolean;
}

const plural = (days: number): string => `${days} ${days === 1 ? "day" : "days"}`;

/** Accounts being closed, the soonest to be erased first, with Restore and Extend by 30 days each behind a confirm. */
export function ClosuresTable({ rows, canAct }: ClosuresTableProps): ReactElement {
  const columns: readonly Column<ClosureRow>[] = [
    {
      id: "client",
      header: "Client",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{row.name}</span>
          {row.ownerName === null ? null : <span className="truncate text-xs leading-4 text-ink-3">{row.ownerName}</span>}
        </span>
      ),
    },
    { id: "closed", header: "Closed on", hideBelow: "sm", cell: (row) => <LocalDate iso={row.closedIso} /> },
    { id: "erase", header: "Erased in", align: "end", cell: (row) => <span className="font-figure text-[13px]">{plural(row.daysLeft)}</span> },
    {
      id: "actions",
      header: "Actions",
      align: "end",
      cell: (row) =>
        canAct ? (
          <span className="flex justify-end gap-2">
            <ConfirmDialog
              title={`Restore ${row.name}`}
              consequence="The account will be restored and deletion cancelled. The client can sign in again; a plan they cancelled stays cancelled."
              triggerLabel="Restore"
              triggerClassName={buttonSmall}
              confirmLabel="Restore account"
              cancelLabel="Keep"
              variant="default"
              formAction={restoreClosureAction}
            >
              <input type="hidden" name="businessId" value={row.businessId} />
            </ConfirmDialog>
            <ConfirmDialog
              title={`Give ${row.name} 30 more days`}
              consequence="The erase date moves 30 days later. Their data stays until then."
              triggerLabel="Extend by 30 days"
              triggerClassName={buttonSmall}
              confirmLabel="Extend by 30 days"
              cancelLabel="Keep"
              variant="default"
              formAction={extendClosureAction}
            >
              <input type="hidden" name="businessId" value={row.businessId} />
            </ConfirmDialog>
          </span>
        ) : (
          <span className="text-xs text-ink-3">Only an admin can restore or extend it.</span>
        ),
    },
  ];
  return (
    <DataTable
      label="Accounts being closed"
      columns={columns}
      rows={rows}
      rowId={(row) => row.businessId}
      state={rows.length === 0 ? "empty" : "ready"}
      empty={<EmptyState title="No account is being closed." description="An account appears here for the 30 days between the owner closing it and its data being erased." />}
    />
  );
}
